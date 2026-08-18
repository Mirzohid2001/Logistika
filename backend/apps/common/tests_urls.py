from django.test import SimpleTestCase
from django.urls import reverse

from apps.common.migration_ops import rename_index_if_exists, rename_index_operation


class UrlNamespaceTests(SimpleTestCase):
    def test_auth_and_users_namespaces_are_distinct(self):
        self.assertEqual(reverse('auth:login'), '/api/auth/login/')
        self.assertEqual(reverse('users:login'), '/api/users/login/')
        self.assertEqual(reverse('users:me'), '/api/users/me/')
        self.assertEqual(reverse('auth:me'), '/api/auth/me/')


class RenameIndexOpsTests(SimpleTestCase):
    def test_rename_skips_missing_indexes(self):
        op = rename_index_if_exists('old_idx', 'new_idx')
        self.assertIn("to_regclass('old_idx')", op.sql)
        self.assertIn("to_regclass('new_idx')", op.sql)
        self.assertIn('ALTER INDEX "old_idx" RENAME TO "new_idx"', op.sql)

    def test_state_still_uses_rename_index(self):
        op = rename_index_operation('user', 'old_idx', 'new_idx')
        self.assertEqual(len(op.state_operations), 1)
        self.assertEqual(op.state_operations[0].old_name, 'old_idx')
        self.assertEqual(op.state_operations[0].new_name, 'new_idx')
