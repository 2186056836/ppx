@file:Suppress("unused")

package com.akari.ppx.xp.hook.assist

import android.media.SoundPool
import com.akari.ppx.utils.*
import com.akari.ppx.xp.Init.cl
import com.akari.ppx.xp.hook.SwitchHook

class SoundHook : SwitchHook("enable_digg_sound") {
    override fun onHook() {
        "com.sup.android.manager.b".findClass(cl).apply {
            replaceMethod(
                "a",
                String::class.java,
                Int::class.java
            ) { param ->
                val manager = param.thisObject
                val soundPool = getStaticObjectFieldOrNullAs<SoundPool>("c") ?: run {
                    manager.callMethod("a")
                    getStaticObjectFieldOrNullAs<SoundPool>("c")
                } ?: return@replaceMethod null
                val cacheMap = getStaticObjectFieldOrNullAs<HashMap<String, Int>>("d") ?: run {
                    manager.callMethod("a")
                    getStaticObjectFieldOrNullAs<HashMap<String, Int>>("d")
                }
                    ?: return@replaceMethod null
                cacheMap[param.args[0] as String]?.let {
                    soundPool.play(it, 1f, 1f, 1, param.args[1] as Int, 1f)
                }
                null
            }
        }
    }
}
