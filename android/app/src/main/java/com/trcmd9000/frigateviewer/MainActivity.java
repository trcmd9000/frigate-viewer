package com.trcmd9000.frigateviewer;

import android.os.Build;
import android.os.Bundle;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.Nullable;

import com.reactnativenavigation.NavigationActivity;

public class MainActivity extends NavigationActivity {
	@Nullable private OnBackInvokedCallback systemBackCallback;

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
