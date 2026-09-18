package com.trcmd9000.frigateviewer;

import android.app.Activity;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.reactnativenavigation.NavigationActivity;

public class MainActivity extends NavigationActivity {
	@Nullable private OnBackInvokedCallback systemBackCallback;

	static void applySystemBarSurface(
			@Nullable Activity activity,
			int backgroundColor,
			boolean darkStatusBarIcons) {
		applySystemBarSurface(activity, backgroundColor, darkStatusBarIcons, false, true);
	}

	static void applySystemBarSurface(
			@Nullable Activity activity,
			int backgroundColor,
			boolean darkStatusBarIcons,
			boolean immersive,
			boolean navigationBarVisible) {
		if (activity == null) {
			return;
		}
		Window window = activity.getWindow();
		window.setBackgroundDrawable(new ColorDrawable(backgroundColor));
		View decorView = window.getDecorView();
		decorView.setBackgroundColor(backgroundColor);
		WindowCompat.setDecorFitsSystemWindows(window, !immersive);
		WindowInsetsControllerCompat controller =
				WindowCompat.getInsetsController(window, decorView);
		if (immersive) {
			controller.hide(WindowInsetsCompat.Type.systemBars());
			controller.setSystemBarsBehavior(
					WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
		} else {
			controller.show(WindowInsetsCompat.Type.statusBars());
			if (navigationBarVisible) {
				controller.show(WindowInsetsCompat.Type.navigationBars());
			} else {
				controller.hide(WindowInsetsCompat.Type.navigationBars());
				controller.setSystemBarsBehavior(
						WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
			}
		}
		controller.setAppearanceLightStatusBars(darkStatusBarIcons);
		decorView.requestApplyInsets();
	}

	@Override
	protected void onCreate(@Nullable Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		if (supportsSystemBackBridge(Build.VERSION.SDK_INT)) {
			systemBackCallback = () -> getOnBackPressedDispatcher().onBackPressed();
			getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
					OnBackInvokedDispatcher.PRIORITY_DEFAULT,
					systemBackCallback);
		}
	}

	@Override
	protected void onDestroy() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && systemBackCallback != null) {
			getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(systemBackCallback);
			systemBackCallback = null;
		}
		super.onDestroy();
	}

	static boolean supportsSystemBackBridge(int apiLevel) {
		return apiLevel >= Build.VERSION_CODES.TIRAMISU;
	}
}
