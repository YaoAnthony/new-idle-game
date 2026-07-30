# 龙猫角落打呼测试图

## 用途
对应《整体架构.md》第一天流程里"撞到墙后头晕的小动物事件图"场景的美术风格测试，用来验证 Codex 内置 imagegen 出图能不能达到游戏要的像素风水准。

## v1 (2026-07-28)
生成方式：Codex CLI 内置 `imagegen` skill（ChatGPT 订阅额度，非按次计费 API）

Prompt:
> Generate a pixel art image using your built-in image generation tool (not by calling any external HTTP API with an API key). Scene: a cozy 32-bit pixel art top-down/isometric-adjacent cottage room at dusk, a small chinchilla curled up asleep in the corner, warm lantern light, wooden floor, plants, cottagecore fantasy style, sharp pixels, no anti-aliasing. Save the resulting PNG file to ./output/codex-test-chinchilla.png in this working directory.

结果：`scratchpad/output/codex-test-chinchilla.png`（未存入仓库，仅测试用）

评价：场景构图、家具细节、暖光氛围都不错，但整体质感"太 AI"——软阴影、渐变光晕、精细笔触，是"像素风味道的写实渲染"而不是真正的硬边整数网格像素画，没有调色板约束。

## v2 (2026-07-28)
Prompt:
> Use your built-in image generation tool. Generate TRUE pixel art (not a painterly/soft-shaded image that merely resembles pixel art). Hard requirements: crisp hard-edged pixels snapped to a visible grid (as if drawn at native 64x64 or 128x128 resolution then scaled up with nearest-neighbor, no anti-aliasing, no smooth gradients or soft blending anywhere), a strictly limited color palette (roughly 20-32 flat colors total), flat cel-shading with dithering/hatching for shadow transitions instead of gradients, thick clean outline on the main subject. Art style reference: Stardew Valley / Moonlighter / Core Keeper isometric room interiors -- NOT a realistic-rendering-with-pixel-texture-filter look. Scene: a cozy top-down/isometric cottage room at dusk, a small chinchilla curled up asleep in the corner on a round cushion, warm lantern light, wooden floor, potted plants, cottagecore fantasy style. Save the PNG to ./output/codex-test-chinchilla-v2.png in this working directory.

结果：`scratchpad/output/codex-test-chinchilla-v2.png`

评价：**不是干净的对照实验**——Codex 看到"128x128 网格 / 20-32 色限定调色板"这类硬性技术指标后，自作主张在生成后额外跑了一遍后处理（降采样到 128x128、median-cut 调色板、误差扩散抖动、最近邻放大到 1024x1024），把用户说"先不做后处理"的那一步也做了。

技术指标确实达标（28 色、8px 均匀像素块），但**视觉效果明显比 v1 差**：抖动算法把画面搅成噪点状的糊团，构图、光影层次、宠物轮廓都难以辨认，可读性大幅下降。

结论：单纯堆更严格的技术约束（网格/调色板数字）这条路走不通——生硬的算法量化 + 抖动会牺牲可读性和美感，真正能打的像素调色板需要美术判断，不是公式能替代的。仅靠改 prompt（不夹带自动后处理）的效果还没有单独验证过，需要下一轮明确禁止 Codex 自行后处理再测。

## 结论与下一步
v1 和 v2 都不是可以直接用的成品。可能的路径：
1. 重新只改 prompt 措辞（参照系、光影描述），但明确告诉 Codex "不要自己做像素化/调色板后处理，只用生成模型的原始输出"，单独验证 prompt 措辞的效果
2. 接受 v1 这种"像素风滤镜"质感（不是硬核复古像素画，但耐看），作为游戏实际风格定位
3. 尝试 RetroDiffusion（付费，需要用户自己注册账号拿 key）——用专门训练在真像素艺术上的模型，大概率比通用扩散模型 + 后处理更可靠
