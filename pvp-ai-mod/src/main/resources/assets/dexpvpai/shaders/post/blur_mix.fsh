#version 330

#moj_import <minecraft:globals.glsl>

uniform sampler2D MainSampler;
uniform sampler2D BlurSampler;

in vec2 texCoord;

out vec4 fragColor;

// Cheap "glass" blur: the blurred image is computed at low resolution and blended in.
// MenuBlurRadius (0..10) is used as the fade amount during the open/close animation.
void main() {
    float m = clamp(float(MenuBlurRadius) / 10.0, 0.0, 1.0);
    vec3 sharp = texture(MainSampler, texCoord).rgb;
    vec3 soft = texture(BlurSampler, texCoord).rgb;
    fragColor = vec4(mix(sharp, soft, m), 1.0);
}
