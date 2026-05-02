package com.akari.ppx.xp

import android.content.Context
import android.os.Bundle
import com.akari.ppx.BuildConfig.APPLICATION_ID
import com.akari.ppx.data.Const.TARGET_APP_ID
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
    private val installedHookLoaders =
        Collections.newSetFromMap(ConcurrentHashMap<Int, Boolean>())

    @JvmStatic
    fun onLegacyLoadPackage(packageName: String, classLoader: ClassLoader) {
        HookRuntime.useLegacy()
        if (packageName == APPLICATION_ID) {
            LegacyHookStatusInit.init(classLoader)
            return
        }
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
                        installHooksOnce(packageName, classLoader, hooks, "attachBaseContext")
                    }.onFailure(Log::e)
                }
            }
            Log.i("Entry mainActivityClass=${mainActivityClass?.name}")
            mainActivityClass?.hookBeforeMethod("onCreate", Bundle::class.java) {
                installHooksOnce(packageName, classLoader, hooks, "MainActivity.onCreate")
            }
            mainActivityClass?.hookBeforeMethod("onResume") {
                installHooksOnce(packageName, classLoader, hooks, "MainActivity.onResume")
            }
        }
    }

    private fun installHooksOnce(
        packageName: String,
        classLoader: ClassLoader,
        hooks: List<BaseHook>,
        source: String
    ) {
        if (!installedHookLoaders.add(System.identityHashCode(classLoader))) {
            Log.d("Entry skip duplicated hook install for $packageName from $source")
            return
        }
        Log.i("Entry install hooks from $source size=${hooks.size}")
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
