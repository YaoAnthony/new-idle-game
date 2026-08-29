import { expect, test } from "vitest";
import { ActionCategory, classifyActionTitle } from "core";

/**
 * 日记本的标题自动分类（Core 关键词表 + 纯函数）。
 *
 * 钉的是**契约和已知的坑**，不是词表全集——词表会一直长，逐词断言只会
 * 让每次加词都红一片。
 */

test("classify_常见标题_各归各类", () => {
  expect(classifyActionTitle("跑了三公里")).toBe(ActionCategory.Exercise);
  expect(classifyActionTitle("写完 assignment2")).toBe(ActionCategory.WorkStudy);
  expect(classifyActionTitle("写小说第三章")).toBe(ActionCategory.Creation);
  expect(classifyActionTitle("午睡半小时")).toBe(ActionCategory.Rest);
  expect(classifyActionTitle("gym session")).toBe(ActionCategory.Exercise);
});

test("classify_写作业不是创作", () => {
  /*
   * 已知的坑："写作业"含"写作"。表序把 work_study 的「作业」排在
   * creation 的「写作」前面，第一个命中的赢——这条测试钉住那个次序，
   * 谁重排词表把它排反了这里就红。
   */
  expect(classifyActionTitle("写作业")).toBe(ActionCategory.WorkStudy);
  expect(classifyActionTitle("写作练习")).toBe(ActionCategory.Creation);
});

test("classify_没命中的落到默认分类", () => {
  expect(classifyActionTitle("随便干点什么")).toBe(ActionCategory.WorkStudy);
  expect(classifyActionTitle("")).toBe(ActionCategory.WorkStudy);
  expect(classifyActionTitle("   ")).toBe(ActionCategory.WorkStudy);
});

test("classify_英文大小写不敏感", () => {
  expect(classifyActionTitle("MORNING RUN")).toBe(ActionCategory.Exercise);
  expect(classifyActionTitle("Design the logo")).toBe(ActionCategory.Creation);
});
