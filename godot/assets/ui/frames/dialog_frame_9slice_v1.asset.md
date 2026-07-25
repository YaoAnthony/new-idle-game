# dialog_frame_9slice_v1.png

Status: generated asset candidate

Generated: 2026-07-22

Source mode: Codex built-in image generation, then local chroma-key removal.

Files:

- Final transparent PNG: `dialog_frame_9slice_v1.png`
- Source chroma PNG: `dialog_frame_9slice_v1_source_chroma.png`

Prompt summary:

Original cozy life-sim inspired 2D game dialog frame for Godot `NinePatchRect` / 9-slice scaling. Warm countryside social-sim mood without copying any specific Animal Crossing UI, franchise identifiers, text, logos, icons or characters. Leafy green rounded outer rim, soft cream paper inner border, warm orange stitch accents, clean transparent center and transparent outside.

Transparency process:

- Generated on flat chroma-key background.
- Removed chroma key with `remove_chroma_key.py`.
- Final image has transparent outside corners and transparent center content area.

Suggested Godot `NinePatchRect` margins:

```text
patch_margin_left = 220
patch_margin_right = 220
patch_margin_top = 160
patch_margin_bottom = 160
```

Notes:

- Keep the four decorative corners inside the fixed corner regions.
- The horizontal and vertical edges can stretch, but heavy scaling may stretch the small leaves and stitch marks. For very large panels, prefer moderate scaling or generate a simpler edge variant.
- Black shown in some previews is viewer background, not image pixels.
