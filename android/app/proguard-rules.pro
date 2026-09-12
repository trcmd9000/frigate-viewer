# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-keep class com.facebook.react.devsupport.CxxInspectorPackagerConnection { *; }
-keep class com.facebook.react.devsupport.CxxInspectorPackagerConnection$* { *; }

# VLC 3.2.6 calls these callback entry points from libvlcjni by name rather
# than through a Java call. Keep only the JNI dispatch class and methods; do
# not keep the whole org.videolan.libvlc package.
-keepnames class org.videolan.libvlc.VLCObject
-keepnames class org.videolan.libvlc.LibVLC
-keepnames class org.videolan.libvlc.Media
-keepnames class org.videolan.libvlc.MediaPlayer
-keepclassmembers class org.videolan.libvlc.VLCObject {
    void dispatchEventFromNative(int, long, long, float, java.lang.String);
    void dispatchEventFromWeakNative(java.lang.Object, int, long, long, float, java.lang.String);
}
