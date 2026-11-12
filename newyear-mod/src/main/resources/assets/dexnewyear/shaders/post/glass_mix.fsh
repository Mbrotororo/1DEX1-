#version 330

uniform sampler2D MainSampler;
uniform sampler2D BlurSampler;
uniform sampler2D MaskSampler;

in vec2 texCoord;

out vec4 fragColor;

// iOS-style glass: the low-resolution blurred image is shown only where the mask says
// (under the menu panels); everything else stays sharp.
void main() {
    float m = texture(MaskSampler, vec2(texCoord.x, 1.0 - texCoord.y)).a;
    vec3 sharp = texture(MainSampler, texCoord).rgb;
    vec3 soft = texture(BlurSampler, texCoord).rgb;
    fragColor = vec4(mix(sharp, soft, m), 1.0);
}
