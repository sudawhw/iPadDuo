// nowplaying — 读取 macOS 系统级「正在播放」信息（QQ 音乐 / 网易云 / Apple Music / 浏览器等通用）。
//
// macOS 15.4 起，MediaRemote 只向 Apple 签名的进程返回数据，所以本文件编译成 dylib，
// 由系统自带的 /usr/bin/perl（com.apple.perl）加载运行：
//   /usr/bin/perl -e 'use DynaLoader; DynaLoader::dl_load_file($ARGV[0], 0)' nowplaying.dylib
// 加载后常驻，播放信息变化时向 stdout 输出一行 JSON。环境变量 NP_ART_DIR 指定封面保存目录。
#import <Foundation/Foundation.h>
#include <dlfcn.h>

typedef void (*GetInfoFn)(dispatch_queue_t, void (^)(NSDictionary *));
typedef void (*RegisterFn)(dispatch_queue_t);

static GetInfoFn getInfo;
static NSString *lastLine;

static id jsonSafe(id v) {
  if (!v) return [NSNull null];
  if ([v isKindOfClass:[NSDate class]]) return @((long long)([(NSDate *)v timeIntervalSince1970] * 1000));
  if ([v isKindOfClass:[NSString class]] || [v isKindOfClass:[NSNumber class]]) return v;
  return [v description];
}

static void emit(void) {
  getInfo(dispatch_get_main_queue(), ^(NSDictionary *info) {
    NSMutableDictionary *o = [NSMutableDictionary dictionary];
    o[@"title"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoTitle"]);
    o[@"artist"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoArtist"]);
    o[@"album"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoAlbum"]);
    o[@"duration"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoDuration"]);
    o[@"elapsed"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoElapsedTime"]);
    o[@"rate"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoPlaybackRate"]);
    o[@"timestamp"] = jsonSafe(info[@"kMRMediaRemoteNowPlayingInfoTimestamp"]);

    // 播放器自带封面时保存下来（QQ 音乐通常不提供，由服务端另行获取）
    NSData *art = info[@"kMRMediaRemoteNowPlayingInfoArtworkData"];
    NSString *dir = [[NSProcessInfo processInfo] environment][@"NP_ART_DIR"];
    if ([art isKindOfClass:[NSData class]] && art.length > 0 && dir) {
      NSString *ident = info[@"kMRMediaRemoteNowPlayingInfoArtworkIdentifier"];
      NSString *name = [NSString stringWithFormat:@"np-%@.img", ident ?: [NSString stringWithFormat:@"%lu", (unsigned long)art.hash]];
      NSString *path = [dir stringByAppendingPathComponent:name];
      if (![[NSFileManager defaultManager] fileExistsAtPath:path]) [art writeToFile:path atomically:YES];
      o[@"artFile"] = path;
    }

    NSData *data = [NSJSONSerialization dataWithJSONObject:o options:0 error:nil];
    NSString *line = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    // 内容没变就不重复输出（定时刷新时 timestamp 不变）
    if (line && ![line isEqualToString:lastLine]) {
      lastLine = line;
      fprintf(stdout, "%s\n", line.UTF8String);
      fflush(stdout);
    }
  });
}

static void start(void) {
  void *h = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW);
  if (!h) { fprintf(stderr, "MediaRemote unavailable\n"); exit(1); }
  getInfo = (GetInfoFn)dlsym(h, "MRMediaRemoteGetNowPlayingInfo");
  RegisterFn reg = (RegisterFn)dlsym(h, "MRMediaRemoteRegisterForNowPlayingNotifications");
  if (!getInfo || !reg) { fprintf(stderr, "MediaRemote symbols missing\n"); exit(1); }
  reg(dispatch_get_main_queue());

  NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
  for (NSString *name in @[ @"kMRMediaRemoteNowPlayingInfoDidChangeNotification",
                            @"kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification",
                            @"kMRMediaRemoteNowPlayingApplicationDidChangeNotification" ]) {
    [nc addObserverForName:name object:nil queue:nil usingBlock:^(NSNotification *n) { emit(); }];
  }
  // 兜底：部分播放器不发通知，每 3 秒主动查一次
  [NSTimer scheduledTimerWithTimeInterval:3 repeats:YES block:^(NSTimer *t) { emit(); }];
  emit();
  // 父进程（node）退出时 stdin 关闭，随之退出，避免残留
  dispatch_source_t src = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0, dispatch_get_main_queue());
  dispatch_source_set_event_handler(src, ^{
    char buf[256];
    if (read(STDIN_FILENO, buf, sizeof buf) <= 0) exit(0);
  });
  dispatch_resume(src);
  CFRunLoopRun();
}

__attribute__((constructor)) static void ctor(void) {
  if (getenv("NP_RUN")) start();
}
