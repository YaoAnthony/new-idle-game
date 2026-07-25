# Modal Frame Asset Metadata

- Asset：`modal_frame.png`
- Version：`v0.1.0 Initial Screen`
- Generated：2026-07-21
- Source：OpenAI IMAGE2 built-in image generation
- Ownership：本项目原创生成资产；未使用外部 UI Kit、商业游戏素材、Logo 或未知授权素材。
- Processing：IMAGE2 输出使用纯 `#ff00ff` chroma-key 背景，随后由本地 `remove_chroma_key.py` 转换为 RGBA PNG。
- Output：IMAGE2 原始输出去底后等比缩放为 `768x512` RGBA PNG，便于 Godot 9-slice 在小型 Modal 上保持边角比例。
- Godot Usage：`NinePatchRect`
- Patch Margin：left/right `80 px`，top/bottom `90 px`，由 `GameStyle.MODAL_PATCH_MARGIN_X/Y` 统一配置。

## IMAGE2 Prompt

```text
Use case: stylized-concept
Asset type: original scalable Godot modal frame texture for 9-slice UI
Primary request: Create one front-facing rectangular Japanese cozy natural game UI frame, designed as a reusable modal panel border. It must be an original design.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
Subject: a centered rectangular frame only, with a completely open empty center showing the chroma-key background. Keep all four corners and all four edges fully visible with generous padding. Symmetrical, stable corner construction and simple straight stretchable edge runs suitable for Godot 9-slice.
Style/medium: polished hand-painted 2D game UI, soft washi paper and subtly wrapped cloth feel, cozy Japanese-inspired natural craft aesthetic, matching a sunlit wooden cottage.
Color palette: muted leaf green main body, warm amber-orange single accent line, thin deep charcoal-green outer edge, restrained warm ivory paper highlights. Do not use #ff00ff in the frame itself.
Materials/textures: very subtle paper fibers, clean readable silhouette, modest rounded corners, minimal corner flourishes based on simple folded paper tabs; no wood grain.
Composition/framing: exact orthographic front view, wide landscape rectangle, border thickness visually consistent, no perspective, no cast shadow, no contact shadow. Clean uninterrupted center large enough for text and controls.
Constraints: suitable for clean chroma-key extraction and 9-slice scaling; edges must be simple and low-detail across their middle stretches; corners remain distinct; no text, no icons, no logo, no characters, no animals, no objects, no watermark, no signature, no commercial-game likeness, no external UI-kit look.
Avoid: ornate fantasy filigree, metallic frame, beveled 3D frame, photorealism, busy decoration, asymmetry, transparency simulation, inner fill panel, gradients in the chroma-key background.
```
