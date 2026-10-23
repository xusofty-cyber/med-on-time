# kotlinx.serialization / Retrofit 模型类保留（当前 release 未开混淆，规则先行登记）
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
}
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-keepclasseswithmembers class com.medontime.app.data.model.** {
    *;
}
