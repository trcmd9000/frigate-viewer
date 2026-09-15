package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public final class PlayerFeedbackModule extends ReactContextBaseJavaModule {
  public PlayerFeedbackModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "PlayerFeedbackModule";
  }

  @ReactMethod
  public void performTransportFeedback(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject(
        "PLAYER_FEEDBACK_ACTIVITY_UNAVAILABLE",
        "Player feedback requires an active Android activity."
      );
      return;
    }

    activity.runOnUiThread(() -> {
      View decorView = activity.getWindow().getDecorView();
      promise.resolve(
        decorView.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
      );
    });
  }
}
