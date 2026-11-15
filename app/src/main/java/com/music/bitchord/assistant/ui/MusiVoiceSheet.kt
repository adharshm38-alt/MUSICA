package com.music.bitchord.assistant.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.music.bitchord.assistant.MusiState
import com.music.bitchord.assistant.wakeword.MusiWakeWordDetector
import com.music.bitchord.ui.icons.SfIcons
import kotlinx.coroutines.delay
import java.util.Locale

@Composable
fun MusiVoiceOverlay(
    state: MusiState,
    onDismiss: () -> Unit,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val visible = state !is MusiState.Idle
    val diagnostics by MusiWakeWordDetector.liveDiagnostics.collectAsStateWithLifecycle()

    // Auto-dismiss after responding or unretryable error finishes
    LaunchedEffect(state) {
        if (state is MusiState.Responding) {
            delay(4500L)
            onDismiss()
        } else if (state is MusiState.Error && !state.canRetry) {
            delay(4000L)
            onDismiss()
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(250)) + slideInVertically(tween(350)) { it / 3 },
        exit = fadeOut(tween(200)) + slideOutVertically(tween(250)) { it / 3 },
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.55f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
            contentAlignment = Alignment.BottomCenter,
        ) {
            // Main Liquid-Glass Card
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 24.dp)
                    .navigationBarsPadding()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {}, // Prevent taps on card from dismissing
                    )
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color(0xE6141416))
                    .border(
                        width = 1.dp,
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.White.copy(alpha = 0.22f),
                                Color.White.copy(alpha = 0.05f),
                            ),
                        ),
                        shape = RoundedCornerShape(32.dp),
                    )
                    .padding(24.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Header: MUSI Identity & Close button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(Color.White.copy(alpha = 0.12f))
                                    .border(0.5.dp, Color.White.copy(alpha = 0.25f), CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = SfIcons.Mic,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "MUSI",
                                    color = Color.White,
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 0.5.sp,
                                )
                                Text(
                                    text = "Your Personal Music Assistant",
                                    color = Color.White.copy(alpha = 0.6f),
                                    fontSize = 12.sp,
                                )
                            }
                        }

                        // Close button
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.08f)),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Close MUSI",
                                tint = Color.White.copy(alpha = 0.8f),
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }

                    Spacer(Modifier.height(28.dp))

                    // Dynamic Soundwave / Orb Visualizer
                    MusiOrbVisualizer(state = state)

                    Spacer(Modifier.height(24.dp))

                    // Spoken text & Responses
                    when (state) {
                        is MusiState.Listening -> {
                            val hasPartial = state.partialText.isNotBlank() && state.partialText != "Listening again..."
                            val displayText = if (hasPartial) {
                                "\"${state.partialText}\""
                            } else if (state.isAutoRetry || state.partialText == "Listening again...") {
                                "Listening again..."
                            } else {
                                "Listening..."
                            }
                            Text(
                                text = displayText,
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = if (hasPartial) "Recognizing speech..." else "Say 'Play music', 'Play Believer', 'Next song'...",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 13.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                        is MusiState.Processing -> {
                            Text(
                                text = "\"${state.spokenText}\"",
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(10.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center,
                            ) {
                                androidx.compose.material3.CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White.copy(alpha = 0.8f),
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = state.stepText.ifBlank { "Processing command..." },
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 13.sp,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                        is MusiState.Responding -> {
                            if (!state.spokenText.isNullOrBlank()) {
                                Text(
                                    text = "\"${state.spokenText}\"",
                                    color = Color.White.copy(alpha = 0.5f),
                                    fontSize = 14.sp,
                                    textAlign = TextAlign.Center,
                                )
                                Spacer(Modifier.height(6.dp))
                            }
                            Text(
                                text = state.responseText,
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            )
                        }
                        is MusiState.Error -> {
                            Text(
                                text = state.message,
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Normal,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            )
                            if (state.canRetry && onRetry != null) {
                                Spacer(Modifier.height(16.dp))
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(Color.White.copy(alpha = 0.15f))
                                        .border(0.5.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(20.dp))
                                        .clickable { onRetry() }
                                        .padding(horizontal = 20.dp, vertical = 10.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = SfIcons.Mic,
                                            contentDescription = "Retry",
                                            tint = Color.White,
                                            modifier = Modifier.size(16.dp),
                                        )
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = "Tap to Try Again",
                                            color = Color.White,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                            }
                        }
                        MusiState.Initializing -> {
                            Text(
                                text = "Waiting for voice...",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Preparing microphone...",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 13.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                        MusiState.Idle -> Unit
                    }

                    // Diagnostic Mode Card: Real-time microphone and detector diagnostics
                    Spacer(Modifier.height(14.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.White.copy(alpha = 0.05f))
                            .border(0.5.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(16.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "DIAGNOSTIC MODE",
                                    color = Color.White.copy(alpha = 0.6f),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                )
                                val isReceiving = diagnostics.audioInputStatus == "Receiving"
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (isReceiving) Color(0x334CAF50) else Color(0x339E9E9E))
                                        .padding(horizontal = 6.dp, vertical = 2.dp),
                                ) {
                                    Text(
                                        text = if (isReceiving) "AUDIO LIVE" else "AUDIO IDLE",
                                        color = if (isReceiving) Color(0xFF81C784) else Color(0xFFBDBDBD),
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            MusiDiagnosticItem(
                                label = "Microphone",
                                value = diagnostics.microphoneStatus,
                                isOk = diagnostics.microphoneStatus == "Available",
                            )
                            MusiDiagnosticItem(
                                label = "Audio input",
                                value = diagnostics.audioInputStatus,
                                isOk = diagnostics.audioInputStatus == "Receiving",
                            )
                            MusiDiagnosticItem(
                                label = "Wake-word model",
                                value = diagnostics.modelStatus,
                                isOk = diagnostics.modelStatus == "Loaded",
                            )
                            MusiDiagnosticItem(
                                label = "Detector",
                                value = diagnostics.detectorStatus,
                                isOk = diagnostics.detectorStatus == "Listening",
                            )
                            MusiDiagnosticItem(
                                label = "Confidence score",
                                value = String.format(Locale.US, "%.2f", diagnostics.lastConfidence),
                            )
                            MusiDiagnosticItem(
                                label = "Last detection result",
                                value = diagnostics.lastResult,
                                isOk = when (diagnostics.lastResult) {
                                    "Accepted" -> true
                                    "Rejected" -> false
                                    else -> null
                                },
                            )
                            if (diagnostics.rejectionReason.isNotBlank() && diagnostics.rejectionReason != "None") {
                                MusiDiagnosticItem(
                                    label = "Rejection reason",
                                    value = diagnostics.rejectionReason,
                                    isOk = false,
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun MusiDiagnosticItem(
    label: String,
    value: String,
    isOk: Boolean? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.55f),
            fontSize = 11.sp,
        )
        val valueColor = when (isOk) {
            true -> Color(0xFF81C784)
            false -> Color(0xFFE57373)
            null -> Color.White.copy(alpha = 0.85f)
        }
        Text(
            text = value,
            color = valueColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
private fun MusiOrbVisualizer(
    state: MusiState,
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "musi_pulse")
    val idlePulse by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "idle_pulse",
    )

    val rms = if (state is MusiState.Listening) state.rmsDb else 0f
    val animatedRms by animateFloatAsState(
        targetValue = rms,
        animationSpec = tween(80, easing = LinearEasing),
        label = "rms_anim",
    )

    Box(
        modifier = modifier.size(110.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val baseRadius = size.minDimension / 4.2f

            when (state) {
                is MusiState.Listening -> {
                    // Outer reactive wave 2
                    val r2 = baseRadius + (baseRadius * 1.3f * animatedRms) + 16.dp.toPx()
                    drawCircle(
                        color = Color.White.copy(alpha = (0.10f + animatedRms * 0.15f).coerceIn(0f, 0.4f)),
                        radius = r2,
                        center = center,
                        style = Stroke(width = 1.5.dp.toPx()),
                    )

                    // Outer reactive wave 1
                    val r1 = baseRadius + (baseRadius * 0.75f * animatedRms) + 8.dp.toPx()
                    drawCircle(
                        color = Color.White.copy(alpha = (0.20f + animatedRms * 0.25f).coerceIn(0f, 0.6f)),
                        radius = r1,
                        center = center,
                        style = Stroke(width = 2.dp.toPx()),
                    )

                    // Core pulsing orb
                    drawCircle(
                        color = Color.White.copy(alpha = 0.18f + animatedRms * 0.12f),
                        radius = baseRadius + 4.dp.toPx(),
                        center = center,
                    )
                }
                is MusiState.Processing -> {
                    val pulse = baseRadius * idlePulse
                    drawCircle(
                        color = Color.White.copy(alpha = 0.15f),
                        radius = pulse + 10.dp.toPx(),
                        center = center,
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                    drawCircle(
                        color = Color.White.copy(alpha = 0.25f),
                        radius = baseRadius,
                        center = center,
                    )
                }
                is MusiState.Responding -> {
                    val r = baseRadius * idlePulse
                    drawCircle(
                        color = Color.White.copy(alpha = 0.22f),
                        radius = r + 6.dp.toPx(),
                        center = center,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                    drawCircle(
                        color = Color.White.copy(alpha = 0.30f),
                        radius = baseRadius,
                        center = center,
                    )
                }
                is MusiState.Error -> {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.12f),
                        radius = baseRadius + 4.dp.toPx(),
                        center = center,
                        style = Stroke(width = 1.dp.toPx()),
                    )
                }
                else -> {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.10f),
                        radius = baseRadius,
                        center = center,
                    )
                }
            }
        }

        // Center Microphone Symbol
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color.White)
                .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = SfIcons.MicFill,
                contentDescription = null,
                tint = Color.Black,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}
