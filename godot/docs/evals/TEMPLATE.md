# Eval：Flow Name

Version：`../versions/vX.Y.Z-short-name.md`

Status：planned

## Purpose

说明要 Evaluation 的 Player Experience 或 System Property。

## Type

Automated、Manual 或 Hybrid。

## Preconditions

- Build/Configuration。
- Fixture/Save/Content Catalog。
- Network/Service State。
- 相关情况下的 Input Device 和 Viewport。

## Setup

描述可复现的 Starting State。相关时包含 Fixed Clock/Random Seed。

## Steps

1. Player/System Action。
2. Expected Visible Response。
3. 继续完成完整 Flow。

## Assertions

- State 和 UI Assertions。
- Save/Network Assertions。
- Error 和 Recovery Assertions。
- 相关情况下的 Accessibility/Localization Assertions。

## Failure Evidence

说明需要保留的 Log、Screenshot、Save Fixture、Trace 或 State Dump。不得捕获 Secret 或不必要的 Personal Content。

## Cleanup

说明如何安全隔离和清理 Temporary Save、Session、Generated Content 或 Test Account。

## Result

记录 Date、Build/Version、Environment、Pass/Fail、Evidence 和关联 Defect/Decision。
