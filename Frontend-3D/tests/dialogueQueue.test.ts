import { afterEach, expect, test } from "vitest";
import { on } from "../src/Game/EventBus";
import { end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";

/**
 * 对话排队：正在说的时候又来一段，排到后面，不顶掉。
 *
 * 回归的是剧情里带 delayMs 的对话撞上正在说的那段——原来直接覆盖，被顶掉的那段
 * 不发 dialogue_ended、走不到带 emitEventId 的节点，挂在上面的剧情就断了。
 */

afterEach(() => {
  while (getActiveDialogue()) end();
});

function collectEnded(): { ended: string[]; off: () => void } {
  const ended: string[] = [];
  const off = on("story_signal", ({ kind, subject }) => {
    if (kind === "dialogue_ended" && subject) ended.push(subject);
  });
  return { ended, off };
}

test("dialogue_说着话又来一段_排到后面_前一段照常发ended", () => {
  const { ended, off } = collectEnded();

  expect(startDialogue("opening_sigh", null)).toBe(true);
  expect(startDialogue("opening_boxes_done", null)).toBe(true);
  expect(getActiveDialogue()?.dialogueId).toBe("opening_sigh");

  end();
  expect(ended).toEqual(["opening_sigh"]);
  expect(getActiveDialogue()?.dialogueId).toBe("opening_boxes_done");

  end();
  expect(ended).toEqual(["opening_sigh", "opening_boxes_done"]);
  expect(getActiveDialogue()).toBeNull();
  off();
});

test("dialogue_ended当场开了新的一段_它先说_排着的继续等", () => {
  const offChain = on("story_signal", ({ kind, subject }) => {
    if (kind === "dialogue_ended" && subject === "opening_sigh") startDialogue("opening_envelope", null);
  });

  startDialogue("opening_sigh", null);
  startDialogue("opening_boxes_done", null);
  end();
  expect(getActiveDialogue()?.dialogueId).toBe("opening_envelope");

  end();
  expect(getActiveDialogue()?.dialogueId).toBe("opening_boxes_done");
  offChain();
});

test("dialogue_不存在的对话_不排队_返回false", () => {
  startDialogue("opening_sigh", null);
  expect(startDialogue("no_such_dialogue", null)).toBe(false);
  end();
  expect(getActiveDialogue()).toBeNull();
});

test("dialogue_同一段同一个人再来一遍_不排队_说完不重播", () => {
  const { ended, off } = collectEnded();
  expect(startDialogue("opening_sigh", null)).toBe(true);
  expect(startDialogue("opening_sigh", null)).toBe(true);
  expect(startDialogue("opening_sigh", null)).toBe(true);
  // 另一段照旧排；同一段再来还是不排
  expect(startDialogue("opening_boxes_done", null)).toBe(true);
  expect(startDialogue("opening_boxes_done", null)).toBe(true);
  end();
  expect(ended).toEqual(["opening_sigh"]);
  expect(getActiveDialogue()?.dialogueId).toBe("opening_boxes_done");
  end();
  expect(ended).toEqual(["opening_sigh", "opening_boxes_done"]);
  expect(getActiveDialogue()).toBeNull();
  off();
});
