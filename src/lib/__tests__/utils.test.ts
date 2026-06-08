import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn() 工具函数", () => {
  it("能够合并多个类名字符串", () => {
    // 验证 cn 可以将多个字符串合并为一个类名字符串
    const result = cn("foo", "bar", "baz");
    expect(result).toBe("foo bar baz");
  });

  it("能够过滤掉 falsy 值（undefined, null, false）", () => {
    // 验证 cn 会自动忽略 falsy 值
    const result = cn("foo", false && "bar", undefined, null, "baz");
    expect(result).toBe("foo baz");
  });

  it("能够处理条件类名（使用 clsx 的对象语法）", async () => {
    // 验证 cn 支持对象形式的条件类名
    const result = cn("base", { active: true, disabled: false });
    expect(result).toBe("base active");
  });

  it("能够合并冲突的 tailwind 类名（使用 twMerge）", () => {
    // 验证 twMerge 能正确处理 tailwind 类名冲突，后者覆盖前者
    const result = cn("px-2 py-1", "px-4");
    expect(result).toBe("py-1 px-4");
  });

  it("无参数时返回空字符串", () => {
    // 验证无参数调用不会报错并返回空字符串
    const result = cn();
    expect(result).toBe("");
  });

  it("能够处理空字符串参数", () => {
    // 验证空字符串不影响结果
    const result = cn("foo", "", "bar");
    expect(result).toBe("foo bar");
  });
});
