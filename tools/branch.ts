export const BRANCH =
  /^(?:main|master|develop|v2|(?:feature|feat|bugfix|fix|hotfix|release|chore|ai|copilot|cursor|claude|codex|admin)\/[a-z0-9]+(?:\.[a-z0-9]+)*(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)*)$/;

export const isBranchName = (name: string) => BRANCH.test(name);

if (import.meta.main) {
  const name = process.argv[2] ?? (await Bun.$`git branch --show-current`.text()).trim();
  if (!isBranchName(name)) {
    console.error(
      `Branch "${name}" does not follow Conventional Branch 1.1.0 (https://conventionalbranch.org).\n` +
        'Rename it to <type>/<description>, for example feat/street-tiles or fix/booth-labels.\n' +
        'Types: feature, feat, bugfix, fix, hotfix, release, chore, ai, claude, codex, copilot, cursor, admin.\n' +
        'Use lower case letters, digits, single hyphens between words and dots only in version numbers.',
    );
    process.exit(1);
  }
}
