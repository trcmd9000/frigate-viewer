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
import androidx.core.view.WindowInsetsControllerCompat;

import com.reactnativenavigation.NavigationActivity;

public class MainActivity extends NavigationActivity {
	@Nullable private OnBackInvokedCallback systemBackCallback;

	static void applySystemBarSurface(
			@Nullable Activity activity,
			int backgroundColor,
			boolean darkStatusBarIcons) {
		if (activity == null) {
			return;
		}
		Window window = activity.getWindow();
		window.setBackgroundDrawable(new ColorDrawable(backgroundColor));
		View decorView = window.getDecorView();
		decorView.setBackgroundColor(backgroundColor);
		WindowInsetsControllerCompat controller =
				WindowCompat.getInsetsController(window, decorView);
		controller.setAppearanceLightStatusBars(darkStatusBarIcons);
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
