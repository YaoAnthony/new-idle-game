# Evaluation: Flow name

## Purpose

State the player experience or system property being evaluated.

## Type

Automated, manual, or hybrid.

## Preconditions

- Build/configuration.
- Fixture/save/content catalog.
- Network/service state.
- Input device and viewport where relevant.

## Setup

Describe a reproducible starting state. Include fixed clock/random seed when relevant.

## Steps

1. Player/system action.
2. Expected visible response.
3. Continue through the complete flow.

## Assertions

- State and UI assertions.
- Save/network assertions.
- Error and recovery assertions.
- Accessibility/localization assertions where relevant.

## Failure evidence

Specify logs, screenshots, save fixtures, traces, or state dumps to retain. Do not capture secrets or unnecessary personal content.

## Cleanup

Describe how temporary saves, sessions, generated content, or test accounts are isolated and removed safely.

## Result

Record date, build/version, environment, pass/fail, evidence, and linked defect/task.
