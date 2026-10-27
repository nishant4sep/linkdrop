#!/usr/bin/env node
/**
 * Seeds clearly-flagged demo content so phase 1 can be exercised end-to-end
 * before real contributors arrive.
 *
 * Everything inserted here carries is_demo = true, so
 *   node scripts/remove-demo.mjs
 * deletes all of it in one command. Demo rows must be removed before any
 * public launch — the live counters and leaderboards planned for phase 2 may
 * only ever show real numbers.
 *
 * Requires: migration 0007_anonymous_pivot.sql applied on the database.
 * Safe to re-run: existing demo rows are detected and skipped.
 */
import process from 'node:process';
import { demoDb, requirePivotMigration } from './demo-db.mjs';

const DEMO_IP = 'demo-fingerprint-seed-script';

const DEMO_POSTS = [
  {
    code: 'demoReel01',
    canonical: 'https://www.instagram.com/reel/demoReel01/',
    title: 'DEMO — Lightroom preset reel',
    resources: [
      {
        url: 'https://example.com/linkdrop-demo/preset-pack-mobile.zip',
        type: 'preset',
        description: 'DEMO — mobile Lightroom preset pack from the reel',
      },
      {
        url: 'https://example.com/linkdrop-demo/preset-install-guide.pdf',
        type: 'pdf',
        description: 'DEMO — how to install the presets (PDF)',
      },
    ],
  },
  {
    code: 'demoReel02',
    canonical: 'https://www.instagram.com/reel/demoReel02/',
    title: 'DEMO — CapCut velocity template reel',
    resources: [
      {
        url: 'https://example.com/linkdrop-demo/capcut-velocity-template.zip',
        type: 'template',
        description: 'DEMO — velocity edit CapCut template',
      },
    ],
  },
  {
    code: 'demoReel03',
    canonical: 'https://www.instagram.com/reel/demoReel03/',
    title: 'DEMO — Notion creator OS reel',
    resources: [
      {
        url: 'https://example.com/linkdrop-demo/creator-os-template.zip',
        type: 'template',
        description: 'DEMO — Notion creator OS template',
      },
      {
        url: 'https://example.com/linkdrop-demo/creator-os-guide.pdf',
        type: 'pdf',
        description: 'DEMO — setup guide PDF',
      },
    ],
  },
  {
    code: 'demoReel04',
    canonical: 'https://www.instagram.com/reel/demoReel04/',
    title: 'DEMO — free icon pack reel',
    resources: [
      {
        url: 'https://example.com/linkdrop-demo/icon-pack-200.zip',
        type: 'project_file',
        description: 'DEMO — 200-icon pack (SVG + PNG)',
      },
    ],
  },
];

/** One demo report quarantines this resource so the console Reports tab has something to review. */
const DEMO_REPORT = {
  postCode: 'demoReel02',
  resourceUrl: 'https://example.com/linkdrop-demo/capcut-velocity-template.zip',
  reason: 'fraud',
  details: 'DEMO report — filed by the seed script purely to demonstrate the reports queue.',
};

const summary = { posts: 0, resources: 0, submissions: 0, reports: 0, skipped: 0 };

function fail(step, error) {
  console.error(`FAIL at ${step} [${error.code ?? 'unknown'}]: ${error.message}`);
  if (error.code === '23503') {
    console.error('A foreign key blocked the write — unexpected for demo data. Inspect the row above in Supabase.');
  }
  process.exit(1);
}

async function seed() {
  const db = demoDb();
  await requirePivotMigration(db);
  console.log('Seeding demo content (is_demo = true everywhere)…');

  for (const demo of DEMO_POSTS) {
    // Post: look up first so re-runs are idempotent without relying on DB upsert.
    let { data: post, error: postError } = await db
      .from('posts')
      .select('id, platform_post_id')
      .eq('platform_post_id', demo.code)
      .maybeSingle();
    if (postError) fail(`posts lookup ${demo.code}`, postError);

    if (!post) {
      const inserted = await db
        .from('posts')
        .insert({
          platform: 'instagram',
          canonical_url: demo.canonical,
          platform_post_id: demo.code,
          canonical_post_id: demo.code,
          is_demo: true,
        })
        .select('id')
        .single();
      if (inserted.error) fail(`posts insert ${demo.code}`, inserted.error);
      post = inserted.data;
      summary.posts += 1;
    }

    for (let index = 0; index < demo.resources.length; index += 1) {
      const resource = demo.resources[index];

      // Resource: skip when this demo URL is already attached to the post.
      const existing = await db
        .from('resources')
        .select('id')
        .eq('post_id', post.id)
        .eq('resource_url', resource.url)
        .maybeSingle();
      if (existing.error) fail(`resources lookup ${demo.code} #${index}`, existing.error);
      if (existing.data) {
        summary.skipped += 1;
        continue;
      }

      const resourceInsert = await db
        .from('resources')
        .insert({
          post_id: post.id,
          resource_url: resource.url,
          normalized_resource_url: resource.url,
          resource_type: resource.type,
          description: resource.description,
          status: 'active',
          is_demo: true,
          submitted_ip_hash: DEMO_IP,
        })
        .select('id')
        .single();
      if (resourceInsert.error) fail(`resources insert ${demo.code} #${index}`, resourceInsert.error);
      const resourceId = resourceInsert.data.id;
      summary.resources += 1;

      // Matching submission row (the anonymous provenance record).
      const submissionInsert = await db
        .from('submissions')
        .insert({
          post_id: post.id,
          submitted_by: null,
          resource_url: resource.url,
          normalized_resource_url: resource.url,
          resource_type: resource.type,
          description: resource.description,
          status: 'approved',
          resource_id: resourceId,
          verification_method: 'community_submission',
          moderation_status: 'approved',
          source: 'anonymous',
          submitted_ip_hash: DEMO_IP,
          is_demo: true,
        })
        .select('id');
      if (submissionInsert.error) fail(`submissions insert ${demo.code} #${index}`, submissionInsert.error);
      summary.submissions += 1;
    }
  }

  // Demo report → quarantined resource, so the Reports tab has a review-ready item.
  const { data: reported, error: reportedError } = await db
    .from('resources')
    .select('id, post_id')
    .eq('resource_url', DEMO_REPORT.resourceUrl)
    .eq('is_demo', true)
    .maybeSingle();
  if (reportedError) fail('reported resource lookup', reportedError);

  if (reported) {
    const { error } = await db
      .from('resource_reports')
      .insert({
        resource_id: reported.id,
        reporter_id: null,
        reporter_ip_hash: DEMO_IP,
        reason: DEMO_REPORT.reason,
        details: DEMO_REPORT.details,
        status: 'unread',
      });
    if (error) {
      if (error.code === '23505') {
        console.log('Demo report already seeded — skipped.');
      } else {
        fail('resource_reports insert', error);
      }
    } else {
      summary.reports += 1;
      const quarantine = await db
        .from('resources')
        .update({ status: 'disputed' })
        .eq('id', reported.id)
        .eq('status', 'active');
      if (quarantine.error) fail('resource quarantine update', quarantine.error);
    }
  }

  console.log('\nDemo content ready:');
  console.log(`  posts created:        ${summary.posts}`);
  console.log(`  resources created:    ${summary.resources}`);
  console.log(`  submissions created:  ${summary.submissions}`);
  console.log(`  demo reports added:   ${summary.reports}`);
  console.log(`  existing rows skipped:${summary.skipped}`);
  console.log('\nTry it locally:  /r/demoReel01 … /r/demoReel04  (/r/demoReel02 exercises the hidden/report flow)');
  console.log('Console:         the Reports tab now lists one DEMO quarantined resource.');
  console.log('\nBefore publishing: run  node scripts/remove-demo.mjs  — demo rows must not go live as fake numbers.');
}

await seed();
