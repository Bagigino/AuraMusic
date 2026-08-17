#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^AuraDownloadProgressHandler)(NSString *progressJSON);

FOUNDATION_EXPORT NSInteger AuraTestPython(NSString * _Nullable * _Nullable errorMessage);
FOUNDATION_EXPORT NSString * _Nullable AuraTestYtDlpImport(
  NSString * _Nullable * _Nullable errorMessage
);
FOUNDATION_EXPORT BOOL AuraTestYtDlpAppleProvider(
  NSInteger * _Nullable success,
  NSString * _Nullable * _Nullable providerName,
  NSString * _Nullable * _Nullable version,
  NSString * _Nullable * _Nullable errorMessage
);
FOUNDATION_EXPORT NSString * _Nullable AuraExtractYouTubeInfo(
  NSString *url,
  NSString * _Nullable * _Nullable errorMessage
);
FOUNDATION_EXPORT NSString * _Nullable AuraResolveYouTubePlaybackSource(
  NSString *url,
  NSString * _Nullable * _Nullable errorMessage
);
FOUNDATION_EXPORT NSString * _Nullable AuraSearchYouTube(
  NSString *query,
  NSInteger limit,
  NSString * _Nullable * _Nullable errorMessage
);
FOUNDATION_EXPORT NSString * _Nullable AuraDownloadYouTubeM4a(
  NSString *url,
  NSString * _Nullable formatId,
  NSString *destinationDirectory,
  AuraDownloadProgressHandler _Nullable progressHandler,
  NSString * _Nullable * _Nullable errorMessage
);

NS_ASSUME_NONNULL_END
