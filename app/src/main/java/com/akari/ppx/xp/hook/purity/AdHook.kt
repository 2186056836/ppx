@file:Suppress("unused")

package com.akari.ppx.xp.hook.purity

import com.akari.ppx.data.Const.TAB_SCHEMA
import com.akari.ppx.utils.Log
import com.akari.ppx.utils.callMethodOrNull
import com.akari.ppx.utils.callMethodOrNullAs
import com.akari.ppx.utils.hookBeforeMethod
import com.akari.ppx.utils.replaceMethod
import com.akari.ppx.xp.Init.absFeedCellClass
import com.akari.ppx.xp.Init.cl
import com.akari.ppx.xp.Init.feedResponse
import com.akari.ppx.xp.Init.feedResponseClass
import com.akari.ppx.xp.Init.splashAdClass
import com.akari.ppx.xp.Init.tabItems
import com.akari.ppx.xp.Init.tabItemsClass
import com.akari.ppx.xp.hook.SwitchHook

class AdHook : SwitchHook("remove_ads") {
    override fun onHook() {
        splashAdClass?.replaceMethod("b") { false }
        "com.sup.android.mi.feed.repo.bean.ad.AdFeedCell".replaceMethod(cl, "getAdInfo") { null }
        hookFeedAds()
        hookCommentAds()
        "com.sup.android.m_comment.view.CommentAdapter".hookBeforeMethod(
            cl,
            "b",
            List::class.java,
            Boolean::class.javaPrimitiveType!!
        ) { param ->
            @Suppress("UNCHECKED_CAST")
            val dockerList = param.args.getOrNull(0) as? MutableList<Any?> ?: return@hookBeforeMethod
            dockerList.indices.reversed().forEach { index ->
                if (dockerList[index].isCommentAdDockerData()) {
                    dockerList.removeAt(index)
                }
            }
        }
        "com.sup.android.m_comment.view.CommentAdapter".hookBeforeMethod(
            cl,
            "a",
            Int::class.javaPrimitiveType!!,
            Class.forName("com.sup.superb.dockerbase.dockerData.IDockerData", false, cl)
        ) { param ->
            if (param.args.getOrNull(1).isCommentAdDockerData()) {
                param.result = null
            }
        }
        listOf(
            "com.sup.android.mi.feed.repo.bean.cell.BannerModel"
        ).forEach { className ->
            runCatching {
                className.replaceMethod(cl, "getBannerData") { null }
            }.onFailure(Log::e)
        }
        tabItemsClass?.hookBeforeMethod(tabItems(), ArrayList::class.java) { param ->
            val originalItems = param.args.getOrNull(0) as? ArrayList<*> ?: return@hookBeforeMethod
            arrayListOf<Any>().let { items ->
                originalItems.filterNotNull().filterTo(items) {
                    it.callMethodOrNullAs<String?>("getTabSchema") == TAB_SCHEMA || it.callMethodOrNullAs<String?>("getEventParams")?.run {
                        contains("comment_identify") || contains("novel") || contains("option")
                    } == true
                }
                param.args[0] = items
            }
        }
    }

    private fun hookFeedAds() {
        feedResponseClass?.hookBeforeMethod(
            feedResponse(),
            String::class.java,
            "com.sup.android.mi.feed.repo.bean.FeedResponse",
            Boolean::class.java,
            Int::class.java
        ) { param ->
            val feeds = param.args.getOrNull(1)?.callMethodOrNullAs<ArrayList<Any?>>("getData")
                ?: return@hookBeforeMethod
            feeds.indices.reversed().forEach { index ->
                if (feeds[index].isMainFeedAdCell()) {
                    feeds.removeAt(index)
                }
            }
        }
    }

    private fun hookCommentAds() {
        "com.sup.android.m_comment.viewmodel.CommentListViewModel".hookBeforeMethod(
            cl,
            "a",
            "com.sup.android.mi.feed.repo.response.CommentListResponse"
        ) { param ->
            val response = param.args.firstOrNull() ?: return@hookBeforeMethod
            val cells = response.callMethodOrNullAs<ArrayList<Any?>>("b") ?: return@hookBeforeMethod
            cells.indices.reversed().forEach { index ->
                if (cells[index].isCommentAdFeedCell()) {
                    cells.removeAt(index)
                }
            }
        }
    }

    private fun Any?.isCommentAdDockerData(): Boolean {
        if (this == null) return false
        if (isCommentAdFeedCell()) return true
        val cellData = callMethodOrNull("getCellData")
        return cellData.isCommentAdFeedCell()
    }

    private fun Any?.isCommentAdFeedCell(): Boolean {
        if (this == null) return false
        if (javaClass.name == COMMENT_AD_MODEL_CLASS) return true
        if (javaClass.name != AD_FEED_CELL_CLASS) return false
        val adInfo = callMethodOrNull("getAdInfo") ?: return false
        val adModel = adInfo.callMethodOrNull("getAdModel") ?: return false
        return adModel.javaClass.name == COMMENT_AD_MODEL_CLASS
    }

    private fun Any?.isMainFeedAdCell(): Boolean {
        if (this == null) return false
        return javaClass.name in MAIN_FEED_AD_CELL_CLASSES
    }

    private companion object {
        const val COMMENT_AD_MODEL_CLASS = "com.sup.android.mi.feed.repo.bean.ad.CommentAdModel"
        const val AD_FEED_CELL_CLASS = "com.sup.android.mi.feed.repo.bean.ad.AdFeedCell"
        val MAIN_FEED_AD_CELL_CLASSES = setOf(
            AD_FEED_CELL_CLASS,
            "com.sup.android.mi.feed.repo.bean.cell.BannerFeedCell",
            "com.sup.android.mi.feed.repo.bean.cell.ButtonBannerFeedCell"
        )
    }
}
