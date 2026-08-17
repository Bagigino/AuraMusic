#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

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

NS_ASSUME_NONNULL_END
