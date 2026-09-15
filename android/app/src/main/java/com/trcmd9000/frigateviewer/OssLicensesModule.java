package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.android.gms.oss.licenses.v2.OssLicensesMenuActivity;

public final class OssLicensesModule extends ReactContextBaseJavaModule {
  public OssLicensesModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "OssLicensesModule";
  }

  @ReactMethod
  public void open(String title, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject(
        "OSS_LICENSES_ACTIVITY_UNAVAILABLE",
        "Open-source licenses require an active Android activity."
      );
      return;
    }

    activity.runOnUiThread(() -> {
      try {
        OssLicensesMenuActivity.setActivityTitle(title);
        activity.startActivity(
          new Intent(activity, OssLicensesMenuActivity.class)
        );
        promise.resolve(null);
      } catch (ActivityNotFoundException error) {
        promise.reject("OSS_LICENSES_ACTIVITY_NOT_FOUND", error);
      }
    });
  }
}
