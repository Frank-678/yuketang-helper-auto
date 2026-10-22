#!/usr/bin/env python3
"""Archive reviewed branch heads, then prune exact refs atomically after CI."""
import argparse, json, os, re, subprocess
from pathlib import Path
REPOSITORY = 'Frank-678/yuketang-helper-auto'
PREFIX = 'refs/tags/archive/2026-10-22/'
def command(*args):
    p = subprocess.run(args, check=True, capture_output=True, text=True)
    return p.stdout.strip()
def pages(endpoint):
    value = json.loads(command('gh', 'api', '--paginate', '--slurp', endpoint))
    return [item for page in value for item in page]
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.environ.get('GITHUB_REPOSITORY') not in [None, REPOSITORY]: raise RuntimeError('Wrong repository')
    origin = command('git', 'remote', 'get-url', 'origin')
    if not re.fullmatch(r'(?:https://github\.com/|git@github\.com:)Frank-678/yuketang-helper-auto(?:\.git)?/?', origin): raise RuntimeError('Unexpected origin repository')
    plan = json.loads(Path(__file__).with_name('retired-branches-20261022.json').read_text())
    expected = {x['branch']: x['sha'] for x in plan if x['branch'] != 'main'}
    refs = dict(line.split()[::-1] for line in command('git', 'ls-remote', '--refs', 'origin').splitlines())
    if 'refs/heads/ANALYSIS' not in refs: raise RuntimeError('ANALYSIS branch must exist before cleanup')
    repair = 'fix/unified-answer-flow'
    if 'refs/heads/' + repair in refs:
        commit = os.environ.get('GITHUB_SHA')
        if not commit or refs['refs/heads/' + repair] != commit: raise RuntimeError('Repair branch has changed; review it first')
        expected[repair] = commit
    extras = {r.removeprefix('refs/heads/') for r in refs if r.startswith('refs/heads/')} - set(expected) - {'main', 'ANALYSIS'}
    if extras: raise RuntimeError('Unreviewed branches appeared: ' + ', '.join(sorted(extras)))
    targets = {}
    archive = {}
    for name, sha in expected.items():
        if not re.fullmatch('[a-f0-9]{40}', sha): raise RuntimeError('Invalid SHA')
        tag = PREFIX + sha[:12]
        if tag in refs and refs[tag] != sha: raise RuntimeError('Archive tag collision')
        if 'refs/heads/' + name not in refs:
            if refs.get(tag) == sha: continue
            raise RuntimeError('Missing branch without a verified archive: ' + name)
        if refs['refs/heads/' + name] != sha: raise RuntimeError('Head changed; preserve and review: ' + name)
        targets[name] = sha
        if tag not in refs: archive[tag] = sha
    print(json.dumps({'retained': ['main', 'ANALYSIS'], 'delete': targets, 'archive': archive}, indent=2))
    if not args.apply: return
    open_pulls = pages('repos/' + REPOSITORY + '/pulls?state=open&per_page=100')
    if any(p.get('head', {}).get('ref') in targets for p in open_pulls): raise RuntimeError('An open PR still uses a target branch')
    branches = {b['name']: b for b in pages('repos/' + REPOSITORY + '/branches?per_page=100')}
    if any(branches.get(name, {}).get('protected') is not False for name in targets): raise RuntimeError('A target branch is now protected')
    command('git', 'fetch', 'origin', '+refs/heads/*:refs/remotes/origin/*')
    release_tags = {
        'refs/tags/archive/2026-10-22/runtime-1.21.7': '4fe7c0382a00d84e2db2d6288c18d3aa2392fd86',
        'refs/tags/archive/2026-10-22/main-before-repair': '0a5edb799629e71b92140b4a21f90105b31710ff',
    }
    current = os.environ.get('GITHUB_SHA')
    if current: release_tags['refs/tags/v1.22.0'] = current
    for tag, sha in release_tags.items():
        if tag in refs and refs[tag] != sha: raise RuntimeError('Release tag collision: ' + tag)
        if tag not in refs: archive[tag] = sha
    for sha in archive.values(): command('git', 'cat-file', '-e', sha + '^{commit}')
    arguments = ['git', 'push', '--atomic']
    arguments += ['--force-with-lease=refs/heads/' + name + ':' + sha for name, sha in targets.items()]
    arguments += ['origin'] + [sha + ':' + tag for tag, sha in archive.items()]
    arguments += [':refs/heads/' + name for name in targets]
    if targets or archive: command(*arguments)
    after = dict(line.split()[::-1] for line in command('git', 'ls-remote', '--refs', 'origin').splitlines())
    if any(after.get(tag) != sha for tag, sha in archive.items()): raise RuntimeError('Archive verification failed')
    remaining = {r.removeprefix('refs/heads/') for r in after if r.startswith('refs/heads/')}
    if remaining != {'main', 'ANALYSIS'}: raise RuntimeError('Unexpected remaining branches: ' + ', '.join(sorted(remaining)))
    print('Verified: only main and ANALYSIS remain; retired heads are archived.')
if __name__ == '__main__': main()
