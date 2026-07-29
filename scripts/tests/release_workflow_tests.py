import unittest
from pathlib import Path


class ReleaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (
            Path(__file__).resolve().parents[2]
            / ".github"
            / "workflows"
            / "notarized-release.yml"
        ).read_text(encoding="utf-8")

    def test_signed_appcast_is_pushed_to_a_dedicated_branch(self):
        self.assertIn(
            'APPCAST_BRANCH="automation/appcast-${TAG}-${BUILD_NUMBER}-${GITHUB_RUN_ID}"',
            self.workflow,
        )
        self.assertIn('git push origin "HEAD:refs/heads/${APPCAST_BRANCH}"', self.workflow)

    def test_release_job_never_pushes_directly_to_protected_main(self):
        self.assertNotIn("git push origin main", self.workflow)
        self.assertNotIn("git pull --rebase origin main", self.workflow)


if __name__ == "__main__":
    unittest.main()
