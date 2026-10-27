#!/usr/bin/env node
/**
 * Removes every seeded demo row, in FK-safe order. Playbook step for the
 * pre-publish checklist: demo numbers must never face real users.
 *
 * Deletes posts where is_demo = true and cascades through their resources,
 * submissions, and reports. Rows that reference demo content through
 * restrict-FKs (moderation reviews, reward ledger entries) are deleted first;
 * if anything unexpected still blocks a delete the script names the table.
 *
 * Requires: migration 0007_anonymous_pivot.sql applied on the database.
 * Safe to re-run: exits cleanly when nothing is left.
 */
import process from 'node:process';
import { demoDb, requirePivotMigration } from './demo-db.mjs';

function blocked(step, error) {
  console.error(`FAIL at ${step} [${error.code ?? 'unknown'}]: ${error.message}`);
  if (error.code === '23503') {
    console.error('A foreign key still references demo data. Delete the offending rows in the Supabase table editor, then re-run this script.');
  }
  process.exit(1);
}

async function remove() {
  const db = demoDb();
  await requirePivotMigration(db);

  const { data: posts, error: postsError } = await db
    .from('posts')
    .select('id, platform_post_id')
    .eq('is_demo', true);
  if (postsError) blocked('demo posts lookup', postsError);

  if (!posts || posts.length === 0) {
    console.log('No demo rows found. Nothing to remove.');
    return;
  }
  const postIds = posts.map((p) => p.id);
  console.log(`Removing ${posts.length} demo post(s): ${posts.map((p) => p.platform_post_id).join(', ')}`);

  const { data: resources, error: resourcesError } = await db
    .from('resources')
    .select('id')
    .in('post_id', postIds);
  if (resourcesError) blocked('demo resources lookup', resourcesError);
  const resourceIds = (resources ?? []).map((r) => r.id);

  const { data: submissions, error: submissionsError } = await db
    .from('submissions')
    .select('id')
    .in('post_id', postIds);
  if (submissionsError) blocked('demo submissions lookup', submissionsError);
  const submissionIds = (submissions ?? []).map((s) => s.id);

  // Restrict-FK children first, so the parents can go.
  const reviewIds = [];
  if (submissionIds.length > 0) {
    const { data, error } = await db.from('moderation_reviews').select('id').in('submission_id', submissionIds);
    if (error) blocked('moderation reviews lookup', error);
    reviewIds.push(...(data ?? []).map((r) => r.id));
  }
  if (resourceIds.length > 0) {
    const { data, error } = await db.from('moderation_reviews').select('id').in('resource_id', resourceIds);
    if (error) blocked('moderation reviews lookup', error);
    reviewIds.push(...(data ?? []).map((r) => r.id));
  }
  const uniqueReviewIds = [...new Set(reviewIds)];
  if (uniqueReviewIds.length > 0) {
    const { error } = await db.from('moderation_reviews').delete().in('id', uniqueReviewIds);
    if (error) blocked('moderation reviews delete', error);
    console.log(`  deleted moderation_reviews: ${uniqueReviewIds.length}`);
  }

  if (submissionIds.length > 0) {
    const { data: ledger, error: ledgerError } = await db
      .from('reward_ledger')
      .select('id')
      .in('submission_id', submissionIds);
    if (ledgerError) blocked('reward ledger lookup', ledgerError);
    const ledgerIds = (ledger ?? []).map((l) => l.id);
    if (ledgerIds.length > 0) {
      const { error } = await db.from('reward_ledger').delete().in('id', ledgerIds);
      if (error) blocked('reward ledger delete', error);
      console.log(`  deleted reward_ledger entries: ${ledgerIds.length}`);
    }
  }

  if (resourceIds.length > 0) {
    const { error, count } = await db.from('resource_reports').delete().in('resource_id', resourceIds);
    if (error) blocked('resource reports delete', error);
    console.log(`  deleted resource_reports: ${count ?? '(cascaded)'}`);
  }

  if (submissionIds.length > 0) {
    const { error, count } = await db.from('submissions').delete().in('id', submissionIds);
    if (error) blocked('submissions delete', error);
    console.log(`  deleted submissions: ${count ?? '(cascaded)'}`);
  }

  if (resourceIds.length > 0) {
    const { error, count } = await db.from('resources').delete().in('id', resourceIds);
    if (error) blocked('resources delete', error);
    console.log(`  deleted resources: ${count ?? '(cascaded)'}`);
  }

  const { error: postsDeleteError, count: postsCount } = await db.from('posts').delete().in('id', postIds);
  if (postsDeleteError) blocked('posts delete', postsDeleteError);
  console.log(`  deleted posts: ${postsCount ?? '(cascaded)'}`);

  console.log('\nDemo content removed. The database now contains only real contributions.');
}

await remove();
