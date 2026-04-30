#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const dexRoot = path.join(workspaceRoot, "dex-620");
const sourceRoot = path.join(repoRoot, "app", "src", "main", "java");

function readU32(buf, off) {
  return buf.readUInt32LE(off);
}

function readU16(buf, off) {
  return buf.readUInt16LE(off);
}

function readUleb(buf, state) {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = buf[state.off++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return result >>> 0;
    shift += 7;
  }
}

function readDexString(buf, off) {
  const state = { off };
  readUleb(buf, state);
  let end = state.off;
  while (buf[end] !== 0) end += 1;
  return buf.toString("utf8", state.off, end);
}

function parseDex(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 3) !== "dex") {
    throw new Error(`${file} is not a dex file`);
  }

  const stringIdsSize = readU32(buf, 56);
  const stringIdsOff = readU32(buf, 60);
  const typeIdsSize = readU32(buf, 64);
  const typeIdsOff = readU32(buf, 68);
  const protoIdsSize = readU32(buf, 72);
  const protoIdsOff = readU32(buf, 76);
  const fieldIdsSize = readU32(buf, 80);
  const fieldIdsOff = readU32(buf, 84);
  const methodIdsSize = readU32(buf, 88);
  const methodIdsOff = readU32(buf, 92);
  const classDefsSize = readU32(buf, 96);
  const classDefsOff = readU32(buf, 100);

  const strings = Array.from({ length: stringIdsSize }, (_, i) => {
    return readDexString(buf, readU32(buf, stringIdsOff + i * 4));
  });

  const types = Array.from({ length: typeIdsSize }, (_, i) => {
    return strings[readU32(buf, typeIdsOff + i * 4)];
  });

  const protos = Array.from({ length: protoIdsSize }, (_, i) => {
    const off = protoIdsOff + i * 12;
    const returnType = types[readU32(buf, off + 4)];
    const paramsOff = readU32(buf, off + 8);
    const params = [];
    if (paramsOff !== 0) {
      const size = readU32(buf, paramsOff);
      for (let j = 0; j < size; j += 1) {
        params.push(types[readU16(buf, paramsOff + 4 + j * 2)]);
      }
    }
    return { returnType, params };
  });

  const fields = Array.from({ length: fieldIdsSize }, (_, i) => {
    const off = fieldIdsOff + i * 8;
    return {
      classType: types[readU16(buf, off)],
      type: types[readU16(buf, off + 2)],
      name: strings[readU32(buf, off + 4)],
    };
  });

  const methods = Array.from({ length: methodIdsSize }, (_, i) => {
    const off = methodIdsOff + i * 8;
    return {
      classType: types[readU16(buf, off)],
      proto: protos[readU16(buf, off + 2)],
      name: strings[readU32(buf, off + 4)],
    };
  });

  const classes = new Map();
  for (let i = 0; i < classDefsSize; i += 1) {
    const off = classDefsOff + i * 32;
    const classType = types[readU32(buf, off)];
    const superclassIdx = readU32(buf, off + 8);
    const classDataOff = readU32(buf, off + 24);
    const item = {
      file: path.basename(file),
      name: classType,
      superclass: superclassIdx === 0xffffffff ? null : types[superclassIdx],
      fields: [],
      methods: [],
    };
    classes.set(classType, item);

    if (classDataOff === 0) continue;
    const state = { off: classDataOff };
    const staticFieldsSize = readUleb(buf, state);
    const instanceFieldsSize = readUleb(buf, state);
    const directMethodsSize = readUleb(buf, state);
    const virtualMethodsSize = readUleb(buf, state);

    for (const count of [staticFieldsSize, instanceFieldsSize]) {
      let fieldIdx = 0;
      for (let j = 0; j < count; j += 1) {
        fieldIdx += readUleb(buf, state);
        readUleb(buf, state);
        item.fields.push(fields[fieldIdx]);
      }
    }

    for (const count of [directMethodsSize, virtualMethodsSize]) {
      let methodIdx = 0;
      for (let j = 0; j < count; j += 1) {
        methodIdx += readUleb(buf, state);
        readUleb(buf, state);
        readUleb(buf, state);
        item.methods.push(methods[methodIdx]);
      }
    }
  }

  return classes;
}

function loadDexClasses() {
  const result = new Map();
  const files = fs.readdirSync(dexRoot)
    .filter((name) => /^classes\d*\.dex$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const name of files) {
    for (const [className, item] of parseDex(path.join(dexRoot, name))) {
      result.set(className, item);
    }
  }
  return result;
}

const classes = loadDexClasses();
const failures = [];

function expect(ok, message) {
  if (!ok) failures.push(message);
}

function cls(name) {
  const c = classes.get(name);
  expect(Boolean(c), `missing class ${name}`);
  return c;
}

function hasMethod(c, name, params, returnType) {
  return c && c.methods.some((m) =>
    m &&
    m.name === name &&
    m.proto.returnType === returnType &&
    JSON.stringify(m.proto.params) === JSON.stringify(params)
  );
}

function hasField(c, name, type) {
  return c && c.fields.some((f) => f && f.name === name && f.type === type);
}

const context = "Landroid/content/Context;";
const activity = "Landroid/app/Activity;";
const absFeedCell = "Lcom/sup/android/mi/feed/repo/bean/cell/AbsFeedCell;";
const optionActionTypeArray = "[Lcom/sup/android/i_sharecontroller/model/OptionAction$OptionActionType;";
const downloadConfig = "Lcom/sup/android/video/f;";
const videoModel = "Lcom/sup/android/base/model/VideoModel;";
const downloadListener = "Lcom/ss/android/socialbase/downloader/depend/IDownloadListener;";
const function1 = "Lkotlin/jvm/functions/Function1;";
const userCenterService = "Lcom/sup/android/mi/usercenter/IUserCenterService;";
const myTabItem = "Lcom/sup/android/m_mine/bean/MyTabItem;";

expect(hasMethod(cls("Lcom/sup/android/safemode/SafeModeApplication;"), "attachBaseContext", [context], "V"), "missing SafeModeApplication.attachBaseContext(Context)");
expect(hasMethod(cls("Lcom/sup/android/base/MainActivity;"), "onCreate", ["Landroid/os/Bundle;"], "V"), "missing MainActivity.onCreate(Bundle)");

const shareView = cls("Lcom/sup/android/m_sharecontroller/ui/e;");
expect(hasField(shareView, "b", optionActionTypeArray), "share view field b OptionActionType[] not found");
expect(hasField(shareView, "c", "Lcom/sup/android/i_sharecontroller/model/OptionAction$a;"), "share view field c OptionAction$a not found");
expect(hasField(shareView, "g", "[Lcom/sup/android/i_sharecontroller/model/c;"), "share view field g model.c[] not found");
expect(hasMethod(shareView, "<init>", [
  context,
  "[Lcom/sup/android/i_sharecontroller/model/c;",
  optionActionTypeArray,
  "Lcom/sup/android/i_sharecontroller/model/OptionAction$a;",
  absFeedCell,
], "V"), "share view constructor signature changed");

expect(hasMethod(cls("Lcom/sup/superb/feedui/repo/a;"), "a", ["Ljava/util/List;"], "Z"), "missing history poster a(List): boolean");
expect(hasMethod(cls("Lcom/sup/superb/feedui/docker/part/m;"), "e", [absFeedCell], optionActionTypeArray), "missing feed action type e(AbsFeedCell): OptionActionType[]");
expect(hasMethod(cls("Lcom/sup/android/detail/util/viewcontroller/b;"), "a", [absFeedCell, "Z"], optionActionTypeArray), "missing detail action type a(AbsFeedCell, boolean): OptionActionType[]");

const listener = cls("Lcom/sup/android/video/g$b;");
expect(listener && listener.superclass === "Lcom/ss/android/socialbase/downloader/depend/AbsDownloadListener;", "download listener superclass changed");
expect(hasField(listener, "f", downloadConfig), "download listener field f VideoDownLoadConfig not found");
expect(hasMethod(listener, "onSuccessed", ["Lcom/ss/android/socialbase/downloader/model/DownloadInfo;"], "V"), "missing download listener onSuccessed(DownloadInfo)");

const config = cls(downloadConfig);
expect(hasMethod(config, "a", [], "J"), "missing VideoDownLoadConfig itemId getter a(): long");
expect(hasMethod(config, "a", ["J"], "V"), "missing VideoDownLoadConfig itemId setter a(long)");
expect(hasMethod(config, "n", [], "Z"), "missing VideoDownLoadConfig showSuccessToast getter n(): boolean");

const helper = cls("Lcom/sup/android/video/g;");
expect(hasField(helper, "b", "Lcom/sup/android/video/g;"), "missing VideoDownloadHelper singleton field b");
expect(hasMethod(helper, "a", [activity, videoModel, downloadConfig, downloadListener, "Lcom/sup/android/video/d;", videoModel, "Z", function1], "V"), "missing public download entry a(Activity, VideoModel, config, listener, callback, godVideoModel, boolean, Function1)");
expect(hasMethod(helper, "b", [], "Z"), "missing isEnableDownloadGodVideo b(): boolean");

const feedUtil = cls("Lcom/sup/android/mi/feed/repo/utils/b$a;");
expect(hasMethod(feedUtil, "P", [absFeedCell], videoModel), "missing AbsFeedCellUtil.Companion getVideoDownload P(AbsFeedCell)");

expect(hasMethod(cls("Lcom/sup/superb/m_feedui_common/util/a;"), "a", ["J", "Lkotlin/jvm/functions/Function0;"], "Ljava/lang/String;"), "missing inexact date a(long, Function0): String");
expect(hasField(cls("Lcom/sup/android/module/publish/publish/c;"), "b", "Lcom/sup/android/module/publish/publish/c;"), "missing PublishLooper singleton field b");
expect(hasMethod(cls("Lcom/sup/android/module/publish/publish/c;"), "a", ["Lcom/sup/android/mi/publish/bean/PublishBean;"], "V"), "missing PublishLooper enqueue a(PublishBean)");

const linkViewModel = cls("Lcom/sup/android/module/publish/viewmodel/LinkViewModel;");
expect(hasField(linkViewModel, "c", "Landroidx/lifecycle/MutableLiveData;"), "missing LinkViewModel field c MutableLiveData");
expect(hasMethod(linkViewModel, "a", [], "Landroidx/lifecycle/MutableLiveData;"), "missing LinkViewModel getter a(): MutableLiveData");
expect(hasMethod(linkViewModel, "a", ["Ljava/lang/String;"], "V"), "missing LinkViewModel fetch a(String)");

expect(hasMethod(cls("Lcom/sup/superb/video/controllerlayer/i;"), "H", [], "Z"), "missing CommonVideoControllerLayer onLongPress H(): boolean");
expect(hasMethod(cls("Lcom/sup/superb/video/controllerlayer/i;"), "J", [], "Z"), "missing CommonVideoControllerLayer onLongPressEnd J(): boolean");

const videoHolder = cls("Lcom/sup/superb/video/viewholder/a;");
expect(hasField(videoHolder, "h", absFeedCell), "missing AbsVideoViewHolder field h AbsFeedCell");
expect(hasMethod(videoHolder, "k_", ["I"], "V"), "missing AbsVideoViewHolder player state k_(int)");

expect(cls("Lcom/sup/android/mi/feed/repo/bean/cell/LiveSaasFeedCell;").superclass === absFeedCell, "LiveSaasFeedCell superclass changed");
expect(hasMethod(cls("Lcom/sup/android/mi/feed/repo/bean/cell/BannerModel;"), "getBannerData", [], "Ljava/util/List;"), "missing new BannerModel getBannerData(): List");

const soundManager = cls("Lcom/sup/android/manager/b;");
expect(hasField(soundManager, "c", "Landroid/media/SoundPool;"), "missing ClickSoundManager soundPool field c");
expect(hasField(soundManager, "d", "Ljava/util/HashMap;"), "missing ClickSoundManager cache field d");
expect(hasMethod(soundManager, "a", [], "V"), "missing ClickSoundManager init a(): void");
expect(hasMethod(soundManager, "a", ["Ljava/lang/String;", "I"], "V"), "missing ClickSoundManager playSound a(String, int)");

expect(hasMethod(cls("Lcom/sup/android/m_mine/utils/h;"), "a", [], "Ljava/util/ArrayList;"), "missing MySettingsHelper list a(): ArrayList");
expect(hasMethod(cls("Lcom/sup/android/m_mine/a/a;"), "a", [context, myTabItem, userCenterService], "Z"), "missing MyPagerClickHelper login gate a(Context, MyTabItem, IUserCenterService): boolean");

function readSource(rel) {
  return fs.readFileSync(path.join(sourceRoot, ...rel.split("/")), "utf8");
}

const sourceChecks = [
  ["com/akari/ppx/xp/Init.kt", [
    "com.sup.android.video.g",
    "com.sup.android.video.f",
    "com.sup.android.mi.feed.repo.utils.b\\$a",
    "\"P\"",
    "\"D\"",
    "\"ay\"",
    "class_video_download_helper",
    "method_download_video",
    "method_can_show_action_pi",
    "com.sup.android.m_sharecontroller.ui.e",
    "com.sup.superb.feedui.repo.a",
    "com.sup.superb.feedui.docker.part.m",
    "com.sup.android.detail.util.viewcontroller.b",
    "com.sup.android.video.g\\$b",
    "com.sup.superb.m_feedui_common.util.a",
  ]],
  ["com/akari/ppx/xp/hook/purity/ShareHook.kt", [
    "[Lcom.sup.android.i_sharecontroller.model.c;",
    "com.sup.android.i_sharecontroller.model.OptionAction\\$a",
    "videoDownloadConfigClass!!",
    "\"n\"",
  ]],
  ["com/akari/ppx/xp/hook/assist/AudioHook.kt", [
    "videoDownloadHelperClass!!",
    "feedCellUtilClass!!",
    "getVideoDownload()",
    "hasDownloadVideo()",
    "downloadVideo()",
    "callMethod(\"a\", -1L)",
    "callMethodAs<Long>(\"a\")",
  ]],
  ["com/akari/ppx/xp/hook/purity/VideoHook.kt", [
    "videoDownloadHelperClass!!",
    "videoDownloadConfigClass!!",
    "downloadEntry()",
    "downloadGodVideoGate()",
    "callMethodAs<Long>(\"a\")",
  ]],
  ["com/akari/ppx/xp/hook/assist/KeepSpeedHook.kt", [
    "com.sup.superb.video.controllerlayer.i",
    "hookBeforeMethod(\"H\")",
    "replaceMethod(\"J\")",
  ]],
  ["com/akari/ppx/xp/hook/auto/WardHook.kt", [
    "com.sup.android.module.publish.publish.c",
    "callMethodOrNullAs<Int>(\"getType\") == 2",
    "callMethod(\"setFakeId\", 666L)",
  ]],
  ["com/akari/ppx/utils/Generic.kt", [
    "com.sup.android.module.publish.publish.c",
    "com.sup.android.mi.publish.bean.PublishMedia",
    "com.sup.android.mi.publish.bean.PublishBean",
    "Boolean::class.javaPrimitiveType!!",
  ]],
  ["com/akari/ppx/xp/hook/assist/LinkHook.kt", [
    "com.sup.android.module.publish.viewmodel.LinkViewModel",
    "String::class.java",
    "getObjectFieldOrNull(\"c\")",
  ]],
  ["com/akari/ppx/xp/hook/auto/BrowseHook.kt", [
    "hookAfterMethod(\"k_\"",
    "getObjectFieldOrNull(\"h\")",
  ]],
  ["com/akari/ppx/xp/hook/purity/FeedHook.kt", [
    "com.sup.android.mi.feed.repo.bean.cell.LiveSaasFeedCell",
  ]],
  ["com/akari/ppx/xp/hook/purity/AdHook.kt", [
    "com.sup.android.mi.feed.repo.bean.cell.BannerModel",
  ]],
  ["com/akari/ppx/xp/hook/assist/SoundHook.kt", [
    "com.sup.android.manager.b",
    "getStaticObjectFieldOrNullAs<SoundPool>(\"c\")",
    "getStaticObjectFieldOrNullAs<HashMap<String, Int>>(\"d\")",
  ]],
  ["com/akari/ppx/xp/hook/misc/InnerOpenHook.kt", [
    "myTabListClass",
    "myTabViewClass",
    "com.sup.android.m_mine.bean.MyTabItem",
    "setTabSchema\", TAB_SCHEMA",
    "setExtra",
    "setType\", 4",
  ]],
];

for (const [rel, tokens] of sourceChecks) {
  const text = readSource(rel);
  for (const token of tokens) {
    expect(text.includes(token), `${rel} missing token ${token}`);
  }
}

const forbidden = [
  "VideoDownloadHelper",
  "VideoDownLoadConfig",
  "ShareInfo",
  "OptionAction\\$OptionActionListener",
  "getShowSuccessToast",
  "getItemId",
  "setItemId",
  "doDownload",
  "isEnableDownloadGodVideo",
  "AbsFeedCellUtil",
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name.endsWith(".kt")) {
      const text = fs.readFileSync(full, "utf8");
      for (const token of forbidden) {
        if (text.includes(token)) {
          failures.push(`${path.relative(repoRoot, full)} still contains old 4.2 token ${token}`);
        }
      }
    }
  }
}
walk(sourceRoot);

if (failures.length > 0) {
  console.error(`verify-ppx-470 failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify-ppx-470 passed");
