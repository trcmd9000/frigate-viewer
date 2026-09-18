package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.graphics.Color;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Keeps the window surface behind an enforced edge-to-edge status bar in sync
 * with the active React Native navigation surface.
 */
public class SystemBarsModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "SystemBarsModule";

  public SystemBarsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @ReactMethod
  public void setSystemBarSurface(
      String backgroundColor,
      String statusBarStyle,
      boolean immersive,
      boolean navigationBarVisible) {
    final int color;
    try {
      color = Color.parseColor(backgroundColor);
    } catch (IllegalArgumentException error) {
      return;
    }

    final boolean darkStatusBarIcons = "dark".equals(statusBarStyle);
    Activity activity = getCurrentActivity();
    if (activity == null) {
      return;
    }
    activity.runOnUiThread(
        () -> activity.getWindow().getDecorView().postOnAnimation(
            () -> MainActivity.applySystemBarSurface(
                activity,
                color,
                darkStatusBarIcons,
                immersive,
                navigationBarVisible)));
  }
}
