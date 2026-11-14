package com.music.bitchord.auth

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.music.bitchord.data.auth.ProtonAuthClient
import com.music.bitchord.data.auth.ProtonSendOtpResult
import com.music.bitchord.data.auth.ProtonVerifyOtpResult
import com.music.bitchord.data.auth.ProtonSession
import com.music.bitchord.sharedui.resources.Res
import com.music.bitchord.sharedui.resources.ic_proton_mail
import com.music.bitchord.R
import com.music.bitchord.ui.icons.BitChordIcons
import com.music.bitchord.ui.player.MeshGradientBackground
import com.music.bitchord.ui.player.MeshPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource

private enum class ProtonLoginStep {
    EMAIL,
    OTP,
}

private val ProtonMeshPalette = MeshPalette(
    listOf(
        Color(0xFF6D4AFF),
        Color(0xFF3E2499),
        Color(0xFF8B5CF6),
        Color(0xFF1A103D),
    ),
)

/**
 * Passwordless Proton Mail authentication flow:
 * 1) Email entry screen (validates Proton email, triggers backend OTP dispatch)
 * 2) 6-digit OTP verification screen (cooldown timer, resend, secure backend verification)
 */
@Composable
fun ProtonLoginScreen(
    onClose: () -> Unit,
    onAuthenticated: (session: ProtonSession, isNewUser: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val store = remember { ProtonAuthStore(context) }
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()

    var step by rememberSaveable { mutableStateOf(ProtonLoginStep.EMAIL) }
    var email by rememberSaveable { mutableStateOf("") }
    var otpCode by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var cooldownSeconds by rememberSaveable { mutableIntStateOf(0) }

    val invalidEmailText = stringResource(R.string.proton_invalid_email)
    val invalidCodeText = stringResource(R.string.proton_invalid_code)

    LaunchedEffect(cooldownSeconds) {
        if (cooldownSeconds > 0) {
            delay(1_000L)
            cooldownSeconds--
        }
    }

    BackHandler {
        if (step == ProtonLoginStep.OTP) {
            step = ProtonLoginStep.EMAIL
            errorMessage = null
        } else {
            onClose()
        }
    }

    fun requestOtp(isResend: Boolean = false) {
        val cleanEmail = email.trim().lowercase()
        if (!ProtonAuthClient.isValidProtonEmail(cleanEmail)) {
            errorMessage = invalidEmailText
            return
        }
        focusManager.clearFocus()
        loading = true
        errorMessage = null
        scope.launch {
            when (val res = ProtonAuthClient.sendOtp(cleanEmail, store.serverUrl)) {
                is ProtonSendOtpResult.Success -> {
                    loading = false
                    email = cleanEmail
                    cooldownSeconds = res.cooldownSeconds
                    if (!isResend) {
                        otpCode = ""
                        step = ProtonLoginStep.OTP
                    }
                }
                is ProtonSendOtpResult.Error -> {
                    loading = false
                    val retryAfter = res.retryAfterSeconds
                    if (retryAfter != null && retryAfter > 0) {
                        cooldownSeconds = retryAfter
                    }
                    errorMessage = res.message
                }
            }
        }
    }

    fun submitOtp() {
        val cleanEmail = email.trim().lowercase()
        val cleanCode = otpCode.trim()
        if (cleanCode.length != 6 || !cleanCode.all { it.isDigit() }) {
            errorMessage = invalidCodeText
            return
        }
        focusManager.clearFocus()
        loading = true
        errorMessage = null
        scope.launch {
            when (val res = ProtonAuthClient.verifyOtp(cleanEmail, cleanCode, store.serverUrl)) {
                is ProtonVerifyOtpResult.Success -> {
                    loading = false
                    store.saveSession(res.session)
                    onAuthenticated(res.session, res.isNewUser)
                }
                is ProtonVerifyOtpResult.Error -> {
                    loading = false
                    errorMessage = res.message
                }
            }
        }
    }

    Box(
        modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) { detectTapGestures { focusManager.clearFocus() } },
    ) {
        MeshGradientBackground(
            palette = ProtonMeshPalette,
            trackKey = step.ordinal,
            continuous = true,
            driftMillis = 7_000,
            colorFadeMillis = 2_000,
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.18f),
                        0.55f to Color.Black.copy(alpha = 0.10f),
                        1f to Color.Black.copy(alpha = 0.58f),
                    ),
                ),
        )

        AnimatedContent(
            targetState = step,
            transitionSpec = {
                val forward = targetState.ordinal > initialState.ordinal
                val slide = tween<androidx.compose.ui.unit.IntOffset>(360)
                (slideInHorizontally(slide) { if (forward) it / 3 else -it / 3 } + fadeIn(tween(280, 80)))
                    .togetherWith(
                        slideOutHorizontally(slide) { if (forward) -it / 3 else it / 3 } + fadeOut(tween(180)),
                    )
            },
            label = "protonLoginStep",
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .imePadding(),
        ) { currentStep ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .widthIn(max = 520.dp)
                        .padding(horizontal = 28.dp),
                ) {
                    when (currentStep) {
                        ProtonLoginStep.EMAIL -> ProtonEmailPage(
                            email = email,
                            loading = loading,
                            errorMessage = errorMessage,
                            onEmailChange = {
                                email = it
                                if (errorMessage != null) errorMessage = null
                            },
                            onBack = onClose,
                            onSubmit = { requestOtp(isResend = false) },
                        )
                        ProtonLoginStep.OTP -> ProtonOtpPage(
                            email = email,
                            otpCode = otpCode,
                            loading = loading,
                            cooldownSeconds = cooldownSeconds,
                            errorMessage = errorMessage,
                            onOtpChange = { input ->
                                val digits = input.filter { it.isDigit() }.take(6)
                                otpCode = digits
                                if (errorMessage != null) errorMessage = null
                            },
                            onBack = {
                                step = ProtonLoginStep.EMAIL
                                errorMessage = null
                            },
                            onVerify = { submitOtp() },
                            onResend = { requestOtp(isResend = true) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.ProtonEmailPage(
    email: String,
    loading: Boolean,
    errorMessage: String?,
    onEmailChange: (String) -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    Spacer(Modifier.height(16.dp))
    ProtonBackButton(onClick = onBack)
    Spacer(Modifier.height(24.dp))

    Box(
        Modifier
            .size(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(Res.drawable.ic_proton_mail),
            contentDescription = null,
            modifier = Modifier.size(28.dp),
        )
    }

    Spacer(Modifier.height(20.dp))
    Text(
        text = stringResource(R.string.proton_login_title),
        style = MaterialTheme.typography.displayLarge.copy(
            fontSize = 36.sp,
            lineHeight = 40.sp,
            letterSpacing = (-1.0).sp,
        ),
        color = Color.White,
    )
    Spacer(Modifier.height(12.dp))
    Text(
        text = stringResource(R.string.proton_login_subtitle),
        style = MaterialTheme.typography.bodyLarge,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        color = Color.White.copy(alpha = 0.74f),
    )

    Spacer(Modifier.height(28.dp))

    val fieldStyle = MaterialTheme.typography.titleMedium.copy(
        fontSize = 18.sp,
        fontWeight = FontWeight.W600,
        color = Color.White,
    )
    Box(
        Modifier
            .fillMaxWidth()
            .height(60.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.14f))
            .border(
                width = 1.dp,
                color = if (errorMessage != null) Color(0xFFFF6B6B).copy(alpha = 0.85f)
                else Color.White.copy(alpha = 0.18f),
                shape = CircleShape,
            )
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (email.isEmpty()) {
            Text(
                text = stringResource(R.string.proton_email_hint),
                style = fieldStyle,
                color = Color.White.copy(alpha = 0.38f),
                maxLines = 1,
            )
        }
        BasicTextField(
            value = email,
            onValueChange = onEmailChange,
            singleLine = true,
            enabled = !loading,
            textStyle = fieldStyle,
            cursorBrush = SolidColor(Color.White),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (errorMessage != null) {
        Spacer(Modifier.height(12.dp))
        Text(
            text = errorMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFFF8A8A),
            modifier = Modifier.padding(horizontal = 6.dp),
        )
    }

    Spacer(Modifier.weight(1f))

    ProtonActionButton(
        label = if (loading) stringResource(R.string.proton_sending_code)
        else stringResource(R.string.proton_send_code),
        loading = loading,
        enabled = email.isNotBlank() && !loading,
        onClick = onSubmit,
    )
    Spacer(Modifier.height(20.dp))
}

@Composable
private fun ColumnScope.ProtonOtpPage(
    email: String,
    otpCode: String,
    loading: Boolean,
    cooldownSeconds: Int,
    errorMessage: String?,
    onOtpChange: (String) -> Unit,
    onBack: () -> Unit,
    onVerify: () -> Unit,
    onResend: () -> Unit,
) {
    Spacer(Modifier.height(16.dp))
    ProtonBackButton(onClick = onBack)
    Spacer(Modifier.height(24.dp))

    Text(
        text = stringResource(R.string.proton_verify_title),
        style = MaterialTheme.typography.displayLarge.copy(
            fontSize = 36.sp,
            lineHeight = 40.sp,
            letterSpacing = (-1.0).sp,
        ),
        color = Color.White,
    )
    Spacer(Modifier.height(12.dp))
    Text(
        text = stringResource(R.string.proton_verify_subtitle, email),
        style = MaterialTheme.typography.bodyLarge,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        color = Color.White.copy(alpha = 0.74f),
    )

    Spacer(Modifier.height(28.dp))

    // 6-digit OTP entry rendered over individual cells so both typing and clipboard paste work seamlessly
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            repeat(6) { index ->
                val char = otpCode.getOrNull(index)?.toString() ?: ""
                val isFocused = otpCode.length == index || (otpCode.length == 6 && index == 5)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.White.copy(alpha = if (char.isNotEmpty()) 0.18f else 0.11f))
                        .border(
                            width = if (isFocused) 1.5.dp else 1.dp,
                            color = when {
                                errorMessage != null -> Color(0xFFFF6B6B).copy(alpha = 0.85f)
                                isFocused -> Color(0xFFA78BFA)
                                else -> Color.White.copy(alpha = 0.16f)
                            },
                            shape = RoundedCornerShape(16.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = char,
                        style = MaterialTheme.typography.displaySmall.copy(
                            fontSize = 26.sp,
                            fontWeight = FontWeight.W700,
                        ),
                        color = Color.White,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        BasicTextField(
            value = otpCode,
            onValueChange = onOtpChange,
            singleLine = true,
            enabled = !loading,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Transparent),
            cursorBrush = SolidColor(Color.Transparent),
            keyboardOptions = KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onVerify() }),
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp),
        )
    }

    if (errorMessage != null) {
        Spacer(Modifier.height(12.dp))
        Text(
            text = errorMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFFF8A8A),
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }

    Spacer(Modifier.height(16.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        val canResend = cooldownSeconds == 0 && !loading
        Text(
            text = if (cooldownSeconds > 0) {
                stringResource(R.string.proton_resend_countdown, cooldownSeconds)
            } else {
                stringResource(R.string.proton_resend_code)
            },
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.W600),
            color = if (canResend) Color(0xFFA78BFA) else Color.White.copy(alpha = 0.45f),
            modifier = Modifier
                .clip(CircleShape)
                .clickable(enabled = canResend, onClick = onResend)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }

    Spacer(Modifier.weight(1f))

    ProtonActionButton(
        label = if (loading) stringResource(R.string.proton_verifying)
        else stringResource(R.string.proton_verify_button),
        loading = loading,
        enabled = otpCode.length == 6 && !loading,
        onClick = onVerify,
    )
    Spacer(Modifier.height(20.dp))
}

@Composable
private fun ProtonActionButton(
    label: String,
    loading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(stiffness = 900f), label = "protonBtnScale")
    val alpha by animateFloatAsState(if (enabled || loading) 1f else 0.4f, tween(180), label = "protonBtnAlpha")

    Row(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .clip(CircleShape)
            .background(Color.White)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = Color.Black,
            )
            Spacer(Modifier.width(10.dp))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontSize = 17.sp,
            fontWeight = FontWeight.W700,
            color = Color.Black,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

@Composable
private fun ProtonBackButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = BitChordIcons.ChevronRight,
            contentDescription = stringResource(R.string.onboarding_back),
            tint = Color.White,
            modifier = Modifier
                .size(18.dp)
                .graphicsLayer { scaleX = -1f },
        )
    }
}
