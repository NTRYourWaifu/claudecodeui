#!/usr/bin/env python3
"""把 ~/.claude/projects 下所有 jsonl 內舊路徑替換成統一 F:\Vs\... 結構"""
import os
import glob

PROJECTS = os.path.expanduser('~/.claude/projects')

# 注意：jsonl 內字串 escape，反斜線在原始字串裡是 `\\`
# 順序很重要：先替換最長的、子路徑優先於父路徑、大小寫變體分開列
MAPPINGS = [
    # exhentai chrome-extension 子目錄
    (r'H:\\Download\\Vs\\exhentai qBittorrent API\\chrome-extension', r'F:\\Vs\\exhentai qBittorrent API\\chrome-extension'),
    (r'h:\\Download\\Vs\\exhentai qBittorrent API\\chrome-extension', r'F:\\Vs\\exhentai qBittorrent API\\chrome-extension'),
    # exhentai 父目錄
    (r'H:\\Download\\Vs\\exhentai qBittorrent API', r'F:\\Vs\\exhentai qBittorrent API'),
    (r'h:\\Download\\Vs\\exhentai qBittorrent API', r'F:\\Vs\\exhentai qBittorrent API'),
    # Ichaival（兩來源 → 同目的）
    (r'H:\\Download\\Vs\\Ichaival', r'F:\\Vs\\Ichaival'),
    (r'h:\\Download\\Vs\\Ichaival', r'F:\\Vs\\Ichaival'),
    (r'H:\\Download\\R18\\DWork\\Ichaival', r'F:\\Vs\\Ichaival'),
    (r'h:\\Download\\R18\\DWork\\Ichaival', r'F:\\Vs\\Ichaival'),
    # LANraragi 子目錄與父目錄
    (r'H:\\Download\\Toolpackage\\LANraragi\\lanraragi', r'F:\\Vs\\LANraragi\\lanraragi'),
    (r'h:\\Download\\Toolpackage\\LANraragi\\lanraragi', r'F:\\Vs\\LANraragi\\lanraragi'),
    (r'H:\\Download\\Toolpackage\\LANraragi', r'F:\\Vs\\LANraragi'),
    (r'h:\\Download\\Toolpackage\\LANraragi', r'F:\\Vs\\LANraragi'),
    (r'H:\\Download\\Toolpackage\\VideoServ', r'F:\\Vs\\VideoServ'),
    (r'h:\\Download\\Toolpackage\\VideoServ', r'F:\\Vs\\VideoServ'),
    # health
    (r'H:\\Download\\health', r'F:\\Vs\\health'),
    (r'h:\\Download\\health', r'F:\\Vs\\health'),
    # BallonsTranslator-git 變體
    (r'F:\\BallonsTranslator-git', r'F:\\Vs\\BallonsTranslator-git'),
    (r'f:\\BallonsTranslator-git', r'F:\\Vs\\BallonsTranslator-git'),
    (r'f:\\Vs\\BallonsTranslator-git', r'F:\\Vs\\BallonsTranslator-git'),
    # 統一所有殘留的小寫 f:\Vs 為大寫 F:\Vs
    (r'f:\\Vs', r'F:\\Vs'),
]

changed_files = 0
total_replacements = 0

for jsonl in glob.glob(os.path.join(PROJECTS, '*', '*.jsonl')):
    try:
        with open(jsonl, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f'  讀取失敗 {jsonl}: {e}')
        continue

    original = content
    file_replacements = 0
    for old, new in MAPPINGS:
        if old in content:
            count = content.count(old)
            content = content.replace(old, new)
            file_replacements += count

    if content != original:
        try:
            with open(jsonl, 'w', encoding='utf-8') as f:
                f.write(content)
            changed_files += 1
            total_replacements += file_replacements
        except Exception as e:
            print(f'  寫入失敗 {jsonl}: {e}')

print(f'改動 {changed_files} 個 jsonl，共 {total_replacements} 處替換')
