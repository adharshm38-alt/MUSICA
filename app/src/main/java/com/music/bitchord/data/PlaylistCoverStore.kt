package com.music.bitchord.data

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Persistent store for user-selected playlist cover artwork.
 *
 * Images selected from Android's Photo Picker or document manager are decoded,
 * center-cropped to a 1:1 square, scaled to at most [MAX_COVER_DIMENSION_PX],
 * and saved into private app storage (`files/playlist_covers/`) so covers remain
 * intact across restarts and reboots without depending on temporary picker URI grants.
 */
object PlaylistCoverStore {
    private const val PREF_NAME = "bitchord_playlist_covers"
    private const val KEY_COVER_MAP = "cover_map_json"
    private const val MAX_COVER_DIMENSION_PX = 1024
    private const val JPEG_QUALITY = 92

    private val SUPPORTED_MIME_PREFIXES = setOf(
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    )

    @Volatile
    private var prefs: SharedPreferences? = null

    @Volatile
    private var repository: PlaylistCoverRepository? = null

    private val _covers = MutableStateFlow<Map<String, String>>(emptyMap())

    /** Stable singleton flow safe to reference before or after [init]. */
    val covers: StateFlow<Map<String, String>> = _covers.asStateFlow()

    fun init(context: Context) {
        val appContext = context.applicationContext
        val sp = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs = sp
        val dir = File(appContext.filesDir, "playlist_covers")
        val existing = repository
        if (existing == null) {
            repository = PlaylistCoverRepository(
                coversDir = dir,
                readMapJson = { sp.getString(KEY_COVER_MAP, null) },
                writeMapJson = { json -> sp.edit().putString(KEY_COVER_MAP, json).apply() },
                state = _covers,
            )
        } else {
            existing.reload()
        }
    }

    fun isCustomizablePlaylistId(browseId: String?): Boolean =
        PlaylistCoverRepository.isCustomizablePlaylistId(browseId)

    fun coverFor(browseId: String?): String? = repository?.getCover(browseId)

    fun hasCustomCover(browseId: String?): Boolean = coverFor(browseId) != null

    /**
     * Copies, EXIF-normalizes, center-crops (1:1), and persists [sourceUri] as
     * the custom cover for [browseId].
     */
    suspend fun saveCustomCover(
        context: Context,
        browseId: String,
        sourceUri: Uri,
    ): Result<String> = withContext(Dispatchers.IO) {
        val appContext = context.applicationContext
        if (repository == null) init(appContext)
        val repo = repository ?: return@withContext Result.failure(IllegalStateException("Cover store unavailable"))
        if (!isCustomizablePlaylistId(browseId)) {
            return@withContext Result.failure(IllegalArgumentException("Unsupported playlist for custom artwork"))
        }

        val mime = appContext.contentResolver.getType(sourceUri)?.lowercase()
        if (mime != null && mime !in SUPPORTED_MIME_PREFIXES && !mime.startsWith("image/")) {
            return@withContext Result.failure(IllegalArgumentException("Unsupported image format"))
        }

        val savedUri = repo.setCover(browseId) { tempOut ->
            writeCenterCroppedSquareJpeg(appContext, sourceUri, tempOut)
        }
        if (savedUri != null) {
            Result.success(savedUri)
        } else {
            Result.failure(IllegalArgumentException("Could not decode selected image"))
        }
    }

    fun resetCustomCover(browseId: String?): Boolean = repository?.resetCover(browseId) == true

    private fun writeCenterCroppedSquareJpeg(context: Context, sourceUri: Uri, outFile: File): Boolean {
        val decoded = decodeScaledBitmap(context, sourceUri) ?: return false
        var square: Bitmap? = null
        var scaled: Bitmap? = null
        return try {
            val side = minOf(decoded.width, decoded.height)
            if (side <= 0) return false
            val x = (decoded.width - side) / 2
            val y = (decoded.height - side) / 2
            square = if (decoded.width == side && decoded.height == side) {
                decoded
            } else {
                Bitmap.createBitmap(decoded, x, y, side, side)
            }
            scaled = if (square.width > MAX_COVER_DIMENSION_PX) {
                Bitmap.createScaledBitmap(square, MAX_COVER_DIMENSION_PX, MAX_COVER_DIMENSION_PX, true)
            } else {
                square
            }
            FileOutputStream(outFile).use { stream ->
                scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
            }
        } catch (_: Exception) {
            false
        } finally {
            if (scaled != null && scaled !== square && scaled !== decoded) scaled.recycle()
            if (square != null && square !== decoded) square.recycle()
            decoded.recycle()
        }
    }

    private fun decodeScaledBitmap(context: Context, sourceUri: Uri): Bitmap? {
        val resolver = context.contentResolver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(resolver, sourceUri)
            return runCatching {
                ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    val minSide = minOf(info.size.width, info.size.height)
                    if (minSide > MAX_COVER_DIMENSION_PX && minSide > 0) {
                        val scale = MAX_COVER_DIMENSION_PX.toFloat() / minSide.toFloat()
                        val w = (info.size.width * scale).toInt().coerceAtLeast(1)
                        val h = (info.size.height * scale).toInt().coerceAtLeast(1)
                        decoder.setTargetSize(w, h)
                    }
                }
            }.getOrNull()
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(sourceUri)?.use { input ->
            BitmapFactory.decodeStream(input, null, bounds)
        } ?: return null
        val rawMin = minOf(bounds.outWidth, bounds.outHeight)
        if (rawMin <= 0) return null

        var sampleSize = 1
        while ((rawMin / (sampleSize * 2)) >= MAX_COVER_DIMENSION_PX) {
            sampleSize *= 2
        }
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val rawBitmap = resolver.openInputStream(sourceUri)?.use { input ->
            BitmapFactory.decodeStream(input, null, opts)
        } ?: return null

        val orientation = resolver.openInputStream(sourceUri)?.use { input ->
            runCatching {
                ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL

        return applyExifOrientation(rawBitmap, orientation)
    }

    private fun applyExifOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.preScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.preScale(-1f, 1f)
            }
            else -> return bitmap
        }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }
}
