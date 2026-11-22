package com.onedex1.luma.glass

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Stack blur (triangle kernel of radius r, i.e. weights r+1-|i|, normalised by (r+1)^2) with clamped
 * edges and rounded division. Separable: one horizontal and one vertical pass, O(w*h) independent of
 * the radius. Operates on non-premultiplied ARGB ints (all four channels are blurred).
 *
 * Pure CPU work: always call it off the main thread (WallpaperEngine uses Dispatchers.Default).
 * The algorithm is verified against a float reference convolution in the preview harness
 * (max error < 1 level per channel).
 */
object StackBlur {

    /** Maximum supported radius (keeps all integer sums far below Int.MAX_VALUE). */
    const val MAX_RADIUS = 254

    /**
     * Returns a new, mutable ARGB_8888 bitmap with [src] blurred by [radius] px.
     * [src] is never modified. radius < 1 returns a plain ARGB_8888 copy.
     */
    fun blur(src: Bitmap, radius: Int): Bitmap {
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
            ?: Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888).also {
                Canvas(it).drawBitmap(src, 0f, 0f, null)
            }
        blurInPlace(out, radius)
        return out
    }

    /** Blurs a mutable ARGB_8888 bitmap in place. */
    fun blurInPlace(bitmap: Bitmap, radius: Int) {
        require(bitmap.isMutable) { "bitmap must be mutable" }
        val w = bitmap.width
        val h = bitmap.height
        if (w < 1 || h < 1 || radius < 1) return
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        blurPixels(pixels, w, h, radius)
        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
    }

    /** Blurs [pixels] (row-major ARGB, [width] x [height]) in place. */
    fun blurPixels(pixels: IntArray, width: Int, height: Int, radius: Int) {
        if (width < 1 || height < 1) return
        require(pixels.size >= width * height) { "pixel buffer too small" }
        val r = min(radius, MAX_RADIUS)
        if (r < 1) return
        val n = max(width, height)
        val line = IntArray(n)
        val out = IntArray(n)
        // Horizontal pass.
        for (y in 0 until height) {
            val off = y * width
            System.arraycopy(pixels, off, line, 0, width)
            blurLine(line, width, r, out)
            System.arraycopy(out, 0, pixels, off, width)
        }
        // Vertical pass.
        for (x in 0 until width) {
            var i = x
            for (y in 0 until height) {
                line[y] = pixels[i]
                i += width
            }
            blurLine(line, height, r, out)
            i = x
            for (y in 0 until height) {
                pixels[i] = out[y]
                i += width
            }
        }
    }

    /**
     * Sliding triangle filter over src[0 until n] (clamped at both ends) into dst.
     * sum      = Σ_{i=-r..r} (r+1-|i|) * v[x+i]
     * sumOut   = Σ_{i=-r..0} v[x+i]   (left half incl. centre)
     * sumIn    = Σ_{i=1..r}  v[x+i]   (right half)
     * step: sumIn += v[x+r+1]; sum += sumIn - sumOut; sumOut += v[x+1] - v[x-r]; sumIn -= v[x+1]
     */
    private fun blurLine(src: IntArray, n: Int, r: Int, dst: IntArray) {
        val last = n - 1
        val div = (r + 1) * (r + 1)
        val half = div / 2

        var sA = 0
        var sR = 0
        var sG = 0
        var sB = 0
        var oA = 0
        var oR = 0
        var oG = 0
        var oB = 0
        var iA = 0
        var iR = 0
        var iG = 0
        var iB = 0

        for (i in -r..r) {
            val c = src[if (i < 0) 0 else if (i > last) last else i]
            val a = c ushr 24
            val cr = (c shr 16) and 0xFF
            val cg = (c shr 8) and 0xFF
            val cb = c and 0xFF
            val wgt = r + 1 - abs(i)
            sA += wgt * a
            sR += wgt * cr
            sG += wgt * cg
            sB += wgt * cb
            if (i <= 0) {
                oA += a; oR += cr; oG += cg; oB += cb
            } else {
                iA += a; iR += cr; iG += cg; iB += cb
            }
        }

        for (x in 0 until n) {
            dst[x] = (((sA + half) / div) shl 24) or
                (((sR + half) / div) shl 16) or
                (((sG + half) / div) shl 8) or
                ((sB + half) / div)

            val cIn = src[min(x + r + 1, last)]
            iA += cIn ushr 24
            iR += (cIn shr 16) and 0xFF
            iG += (cIn shr 8) and 0xFF
            iB += cIn and 0xFF

            sA += iA - oA
            sR += iR - oR
            sG += iG - oG
            sB += iB - oB

            val cNext = src[min(x + 1, last)]
            val cOld = src[max(x - r, 0)]
            val nA = cNext ushr 24
            val nR = (cNext shr 16) and 0xFF
            val nG = (cNext shr 8) and 0xFF
            val nB = cNext and 0xFF
            oA += nA - (cOld ushr 24)
            oR += nR - ((cOld shr 16) and 0xFF)
            oG += nG - ((cOld shr 8) and 0xFF)
            oB += nB - (cOld and 0xFF)
            iA -= nA
            iR -= nR
            iG -= nG
            iB -= nB
        }
    }
}

/**
 * High quality downscale to exactly [targetW] x [targetH]: repeated bilinear halving (each step is an
 * exact 2x2 box average, so no aliasing / dropped details) followed by one final bilinear step.
 * Returns an ARGB_8888 bitmap (a new one unless the size already matches and the config is right).
 */
internal fun Bitmap.progressiveDownscale(targetW: Int, targetH: Int): Bitmap {
    val tw = max(1, targetW)
    val th = max(1, targetH)
    var cur = this
    while (cur.width / 2 >= tw && cur.height / 2 >= th) {
        val next = Bitmap.createScaledBitmap(cur, cur.width / 2, cur.height / 2, true)
        if (cur !== this && next !== cur) cur.recycle()
        cur = next
    }
    if (cur.width != tw || cur.height != th) {
        val next = Bitmap.createScaledBitmap(cur, tw, th, true)
        if (cur !== this && next !== cur) cur.recycle()
        cur = next
    }
    if (cur.config != Bitmap.Config.ARGB_8888) {
        val next = cur.copy(Bitmap.Config.ARGB_8888, false) ?: cur
        if (cur !== this && next !== cur) cur.recycle()
        cur = next
    }
    return cur
}

/** Center-crops and scales [src] to exactly [w] x [h] (bilinear). Always returns a new bitmap. */
internal fun centerCropBitmap(src: Bitmap, w: Int, h: Int): Bitmap {
    val out = Bitmap.createBitmap(max(1, w), max(1, h), Bitmap.Config.ARGB_8888)
    val s = max(out.width / src.width.toFloat(), out.height / src.height.toFloat())
    val m = Matrix()
    m.setScale(s, s)
    m.postTranslate(
        ((out.width - src.width * s) / 2f).roundToInt().toFloat(),
        ((out.height - src.height * s) / 2f).roundToInt().toFloat(),
    )
    Canvas(out).drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG))
    return out
}
