package com.akari.ppx.xp

import android.content.Context
import android.net.Uri
import android.os.Bundle
import com.akari.ppx.BuildConfig.APPLICATION_ID
import com.akari.ppx.data.Const.CP_URI
import com.akari.ppx.data.Const.MODULE_ACTIVE_KEY
import com.akari.ppx.data.Const.MODULE_ACTIVE_SOURCE_KEY
import com.akari.ppx.data.Const.MODULE_ACTIVE_TS_KEY
import com.akari.ppx.data.Const.TARGET_APP_ID
import com.akari.ppx.data.PrefsType
import com.akari.ppx.data.XPrefs
import com.akari.ppx.utils.HookRuntime
import com.akari.ppx.utils.Log
import com.akari.ppx.utils.check
import com.akari.ppx.utils.hookBeforeMethod
import com.akari.ppx.utils.new
import com.akari.ppx.xp.Init.cl
import com.akari.ppx.xp.Init.mainActivityClass
import com.akari.ppx.xp.Init.safeModeApplicationClass
import com.akari.ppx.xp.hook.BaseHook
import com.akari.ppx.xp.hook.SwitchHook
import dalvik.system.DexFile
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

object ModuleEntryBridge {
    private val installedClassLoaders =
        Collections.newSetFromMap(ConcurrentHashMap<Int, Boolean>())

    @JvmStatic
    fun onLegacyLoadPackage(packageName: String, classLoader: ClassLoader) {
        HookRuntime.useLegacy()
        handleLoadPackage(packageName, classLoader)
    }

    @JvmStatic
    fun onModernModuleLoaded(module: Any, apiVersion: Int, processName: String, isSystemServer: Boolean) {
        HookRuntime.useModern(module, apiVersion)
        Log.i("Modern module loaded api=$apiVersion process=$processName system=$isSystemServer")
    }

    @JvmStatic
    fun onModernPackageLoaded(module: Any, apiVersion: Int, packageName: String, classLoader: ClassLoader) {
        HookRuntime.useModern(module, apiVersion)
        handleLoadPackage(packageName, classLoader)
    }

    private fun handleLoadPackage(packageName: String, classLoader: ClassLoader) {
        when (packageName) {
            TARGET_APP_ID -> installTargetHooks(packageName, classLoader)
        }
    }

    private fun installTargetHooks(packageName: String, classLoader: ClassLoader) {
        if (!installedClassLoaders.add(System.identityHashCode(classLoader))) {
            Log.d("Entry skip duplicated loader for $packageName")
            return
        }
        cl = classLoader
        Log.i("Entry loaded for $packageName")
        arrayListOf<BaseHook>().let { hooks ->
            safeModeApplicationClass?.hookBeforeMethod(
                "attachBaseContext",
                Context::class.java
            ) { param ->
                Log.i("Entry attachBaseContext")
                with(param.args[0] as Context) {
                    reportModuleActive(this, packageName)
                    runCatching { Init(this) }.onFailure(Log::e)
                    runCatching {
                        packageManager.getApplicationInfo(APPLICATION_ID, 0).run {
                            DexFile(sourceDir).entries()
                        }.asSequence().filter {
                            it.startsWith(BaseHook::class.java.`package`!!.name)
                        }.mapNotNull { className ->
                            runCatching { Class.forName(className) }.onFailure(Log::e).getOrNull()
                        }.filter {
                            !it.isInterface && BaseHook::class.java.isAssignableFrom(it) && it != SwitchHook::class.java
                        }.forEach { hookClass ->
                            runCatching {
                                if (hooks.none { it.javaClass == hookClass }) {
                                    hooks += hookClass.new() as BaseHook
                                }
                            }.onFailure(Log::e)
                        }
                        Log.i("Entry hook scan size=${hooks.size}")
                    }.onFailure(Log::e)
                }
            }
            Log.i("Entry mainActivityClass=${mainActivityClass?.name}")
            mainActivityClass?.hookBeforeMethod("onCreate", Bundle::class.java) {
                Log.i("Entry MainActivity.onCreate hooks=${hooks.size}")
                hooks.forEach { hook ->
                    runCatching {
                        Log.d("Entry run hook ${hook.javaClass.name}")
                        when (hook) {
                            is SwitchHook -> {
                                XPrefs<Boolean>(hook.key).check(true) {
                                    hook.onHook()
                                }
                            }
                            else -> hook.onHook()
                        }
                    }.onFailure {
                        Log.e("${hook.javaClass.name} init failed")
                        Log.e(it)
                    }
                }
            }
        }
    }

    private fun reportModuleActive(context: Context, packageName: String) {
        runCatching {
            val uri = Uri.parse(CP_URI)
            context.contentResolver.call(
                uri,
                PrefsType.SET_BOOLEAN.method,
                MODULE_ACTIVE_KEY,
                Bundle().apply { putBoolean(PrefsType.SET_BOOLEAN.key, true) }
            )
            context.contentResolver.call(
                uri,
                PrefsType.SET_STRING.method,
                MODULE_ACTIVE_TS_KEY,
                Bundle().apply { putString(PrefsType.SET_STRING.key, System.currentTimeMillis().toString()) }
            )
            context.contentResolver.call(
                uri,
                PrefsType.SET_STRING.method,
                MODULE_ACTIVE_SOURCE_KEY,
                Bundle().apply { putString(PrefsType.SET_STRING.key, packageName) }
            )
        }.onFailure(Log::e)
    }
}
