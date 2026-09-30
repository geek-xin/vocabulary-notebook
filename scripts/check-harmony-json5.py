#!/usr/bin/env python3
"""校验 harmony/ 下所有 .json5 文件能被正确解析。

鸿蒙工程用 JSON5（允许注释、尾逗号、无引号 key），标准 json 模块读不了。
本机没有 DevEco / hvigor，无法真正编译，所以至少把「文件是不是合法 JSON5」
这一层守住 —— 语法错误在 CI 上会浪费一整轮构建。

用法：python3 scripts/check-harmony-json5.py
"""
import json
import pathlib
import re
import sys


def strip_comments(text: str) -> str:
    """去掉 // 与 /* */ 注释；跳过字符串字面量内部，避免误删 URL 里的 //。"""
    out = []
    i = 0
    n = len(text)
    in_str = False
    quote = ''
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                in_str = False
            i += 1
            continue
        if ch in '"\'':
            in_str = True
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == '/' and i + 1 < n and text[i + 1] == '/':
            while i < n and text[i] != '\n':
                i += 1
            continue
        if ch == '/' and i + 1 < n and text[i + 1] == '*':
            i += 2
            while i + 1 < n and not (text[i] == '*' and text[i + 1] == '/'):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def quote_bare_keys(text: str) -> str:
    """给无引号的 key 补上双引号（JSON5 允许，标准 json 不允许）。"""
    return re.sub(r'(?m)^(\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)', r'\1"\2"\3', text)


def strip_trailing_commas(text: str) -> str:
    return re.sub(r',(\s*[}\]])', r'\1', text)


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent / 'harmony'
    files = sorted(root.rglob('*.json5'))
    if not files:
        print('✗ harmony/ 下没找到任何 .json5 文件，检查逻辑可能失效了。')
        return 1

    bad = 0
    for f in files:
        raw = f.read_text(encoding='utf-8')
        text = strip_trailing_commas(quote_bare_keys(strip_comments(raw)))
        try:
            json.loads(text)
            print('  ✓ ' + str(f.relative_to(root.parent)))
        except Exception as exc:
            bad += 1
            print('  ✗ ' + str(f.relative_to(root.parent)) + ' -> ' + str(exc))

    print()
    if bad:
        print('✗ ' + str(bad) + '/' + str(len(files)) + ' 个 JSON5 文件解析失败')
        return 1
    print('✓ harmony/ 下 ' + str(len(files)) + ' 个 JSON5 文件全部合法')
    return 0


if __name__ == '__main__':
    sys.exit(main())
