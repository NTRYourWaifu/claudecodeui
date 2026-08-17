# Migrate old H:/lowercase-f: cwd paths in ~/.claude/projects/*.jsonl to F:\Vs\* layout

$projects = Join-Path $env:USERPROFILE '.claude\projects'

$mappings = @(
    @{ old = 'H:\\Download\\Vs\\exhentai qBittorrent API\\chrome-extension'; new = 'F:\\Vs\\exhentai qBittorrent API\\chrome-extension' }
    @{ old = 'h:\\Download\\Vs\\exhentai qBittorrent API\\chrome-extension'; new = 'F:\\Vs\\exhentai qBittorrent API\\chrome-extension' }
    @{ old = 'H:\\Download\\Vs\\exhentai qBittorrent API'; new = 'F:\\Vs\\exhentai qBittorrent API' }
    @{ old = 'h:\\Download\\Vs\\exhentai qBittorrent API'; new = 'F:\\Vs\\exhentai qBittorrent API' }
    @{ old = 'H:\\Download\\Vs\\Ichaival'; new = 'F:\\Vs\\Ichaival' }
    @{ old = 'h:\\Download\\Vs\\Ichaival'; new = 'F:\\Vs\\Ichaival' }
    @{ old = 'H:\\Download\\R18\\DWork\\Ichaival'; new = 'F:\\Vs\\Ichaival' }
    @{ old = 'h:\\Download\\R18\\DWork\\Ichaival'; new = 'F:\\Vs\\Ichaival' }
    @{ old = 'H:\\Download\\Toolpackage\\LANraragi\\lanraragi'; new = 'F:\\Vs\\LANraragi\\lanraragi' }
    @{ old = 'h:\\Download\\Toolpackage\\LANraragi\\lanraragi'; new = 'F:\\Vs\\LANraragi\\lanraragi' }
    @{ old = 'H:\\Download\\Toolpackage\\LANraragi'; new = 'F:\\Vs\\LANraragi' }
    @{ old = 'h:\\Download\\Toolpackage\\LANraragi'; new = 'F:\\Vs\\LANraragi' }
    @{ old = 'H:\\Download\\Toolpackage\\VideoServ'; new = 'F:\\Vs\\VideoServ' }
    @{ old = 'h:\\Download\\Toolpackage\\VideoServ'; new = 'F:\\Vs\\VideoServ' }
    @{ old = 'H:\\Download\\health'; new = 'F:\\Vs\\health' }
    @{ old = 'h:\\Download\\health'; new = 'F:\\Vs\\health' }
    @{ old = 'F:\\BallonsTranslator-git'; new = 'F:\\Vs\\BallonsTranslator-git' }
    @{ old = 'f:\\BallonsTranslator-git'; new = 'F:\\Vs\\BallonsTranslator-git' }
    @{ old = 'f:\\Vs\\BallonsTranslator-git'; new = 'F:\\Vs\\BallonsTranslator-git' }
    @{ old = 'f:\\Vs'; new = 'F:\\Vs' }
)

$changedFiles = 0
$totalReplacements = 0
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

Get-ChildItem -Path $projects -Recurse -Filter '*.jsonl' | ForEach-Object {
    $file = $_.FullName
    try {
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    } catch {
        Write-Host "READ FAIL $file"
        return
    }

    $original = $content
    $fileReplacements = 0
    foreach ($map in $mappings) {
        if ($content.Contains($map.old)) {
            $count = ($content.Length - ($content.Replace($map.old, '').Length)) / $map.old.Length
            $content = $content.Replace($map.old, $map.new)
            $fileReplacements += $count
        }
    }

    if ($content -ne $original) {
        try {
            [System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
            $script:changedFiles++
            $script:totalReplacements += $fileReplacements
        } catch {
            Write-Host "WRITE FAIL $file"
        }
    }
}

Write-Host "DONE: changed=$changedFiles replacements=$totalReplacements"
