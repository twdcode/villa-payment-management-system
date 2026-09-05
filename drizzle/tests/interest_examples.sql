-- Phase 9 SQL acceptance tests — INTEREST-EXAMPLES.md E1-E7 against real Postgres.
-- Each example gets its own villa/stage so they never interact. Assertions raise on
-- failure so a single failing example stops the script with a clear message.

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(label text, expected numeric, actual numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF expected IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'FAIL % — expected %, got %', label, expected, actual;
  ELSE
    RAISE NOTICE 'PASS % (%)', label, actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq_text(label text, expected text, actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF expected IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'FAIL % — expected %, got %', label, expected, actual;
  ELSE
    RAISE NOTICE 'PASS % (%)', label, actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(label text, actual boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT actual THEN
    RAISE EXCEPTION 'FAIL % — expected true, got %', label, actual;
  ELSE
    RAISE NOTICE 'PASS %', label;
  END IF;
END;
$$;

DO $$
DECLARE
  v_project uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();

  v_villa_e1 uuid; v_stage_e1 uuid;
  v_villa_e2 uuid; v_stage_e2 uuid;
  v_villa_e3 uuid; v_stage_e3 uuid;
  v_villa_e4 uuid; v_stage_e4 uuid;
  v_villa_e5 uuid; v_stage_e5 uuid;
  v_villa_e6 uuid; v_stage_e6 uuid;
  v_villa_e7 uuid; v_stage_a uuid; v_stage_b uuid;

  r record;
BEGIN
  -- Shared fixtures: one project, one customer, one recording user.
  INSERT INTO public.projects (id, name, location, status) VALUES (v_project, 'Test Project', 'Test', 'active');
  INSERT INTO public.customers (id, full_name, email) VALUES (v_customer, 'Test Customer', 'test@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_auth, 'recorder@example.com');
  INSERT INTO public.users (id, auth_user_id, full_name, email, role, status, scope)
    VALUES (v_user, v_auth, 'Recorder', 'recorder@example.com', 'staff', 'active', 'global');

  -- Baseline terms from INTEREST-EXAMPLES.md: 1.5% monthly, 15-day grace, /30 divisor,
  -- after-grace start, interest-first allocation.
  PERFORM set_config('app.workspace_today', '2026-08-28', true);

  ----------------------------------------------------------------
  -- E1 — Baseline overdue interest.
  -- 2,000,000 principal, due 2026-07-10, grace ends 2026-07-25, valued 2026-08-28.
  -- Expected: 34 chargeable days, 34,000 interest, 2,034,000 total payable.
  ----------------------------------------------------------------
  v_villa_e1 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e1, v_project, 'E1', 2000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e1, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e1, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_e1 := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_e1, v_villa_e1, 1, 'Stage 1', '2026-07-10', 2000000, 15);

  SELECT overdue_days, interest_accrued, (principal_outstanding + interest_accrued) AS total_payable, status
    INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e1;
  PERFORM pg_temp.assert_eq('E1 chargeable days', 34, r.overdue_days);
  PERFORM pg_temp.assert_eq('E1 interest accrued', 34000.00, r.interest_accrued);
  PERFORM pg_temp.assert_eq('E1 total payable', 2034000.00, r.total_payable);

  ----------------------------------------------------------------
  -- E2 — Second villa, independent confirmation.
  -- 3,200,000 principal, due 2026-08-05, grace ends 2026-08-20, valued 2026-08-28.
  -- Expected: 8 chargeable days, 12,800 interest.
  ----------------------------------------------------------------
  v_villa_e2 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e2, v_project, 'E2', 3200000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e2, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e2, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_e2 := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_e2, v_villa_e2, 1, 'Stage 1', '2026-08-05', 3200000, 15);

  SELECT overdue_days, interest_accrued INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e2;
  PERFORM pg_temp.assert_eq('E2 chargeable days', 8, r.overdue_days);
  PERFORM pg_temp.assert_eq('E2 interest accrued', 12800.00, r.interest_accrued);

  ----------------------------------------------------------------
  -- E3 — Inside the grace period.
  -- 4,000,000 principal, due 2026-08-20, grace ends 2026-09-04, valued 2026-08-28.
  -- Expected: 0 chargeable days, 0 interest, status Due (never Overdue).
  ----------------------------------------------------------------
  v_villa_e3 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e3, v_project, 'E3', 4000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e3, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e3, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_e3 := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_e3, v_villa_e3, 1, 'Stage 1', '2026-08-20', 4000000, 15);

  SELECT overdue_days, interest_accrued, status INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e3;
  PERFORM pg_temp.assert_eq('E3 chargeable days', 0, r.overdue_days);
  PERFORM pg_temp.assert_eq('E3 interest accrued', 0.00, r.interest_accrued);
  PERFORM pg_temp.assert_eq_text('E3 status is Due not Overdue', 'due', lower(r.status));

  ----------------------------------------------------------------
  -- E4 — Partial payment, interest-first allocation.
  -- Continues E1: 2,000,000 principal / 34,000 interest accrued at 2026-08-28.
  -- Pay 1,000,000 on 2026-08-28: expect 34,000 to interest, 966,000 to principal.
  ----------------------------------------------------------------
  v_villa_e4 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e4, v_project, 'E4', 2000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e4, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e4, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_e4 := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_e4, v_villa_e4, 1, 'Stage 1', '2026-07-10', 2000000, 15);

  PERFORM public.record_collection(v_villa_e4, v_customer, '2026-08-28', 1000000, 'cash', NULL, 'e4-key', v_user, NULL, NULL, 'E4-R1', NULL, NULL);

  SELECT principal_paid, interest_paid, principal_outstanding, interest_accrued, status
    INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e4;
  PERFORM pg_temp.assert_eq('E4 interest paid', 34000.00, r.interest_paid);
  PERFORM pg_temp.assert_eq('E4 principal paid', 966000.00, r.principal_paid);
  PERFORM pg_temp.assert_eq('E4 remaining principal', 1034000.00, r.principal_outstanding);
  -- interest_accrued is the lifetime CHARGED total (mirrors interestAccrued in
  -- calculations.ts), not what remains owed — that is interest_accrued - interest_paid,
  -- the same convention interestOutstanding() uses in the TypeScript layer.
  PERFORM pg_temp.assert_eq('E4 lifetime interest charged', 34000.00, r.interest_accrued);
  PERFORM pg_temp.assert_eq('E4 interest still owed (accrued - paid)', 0.00, GREATEST(0, r.interest_accrued - r.interest_paid));

  ----------------------------------------------------------------
  -- E5 — Interest continues on the reduced principal.
  -- Continues E4. Move the clock 10 days forward (2026-09-07) with no further payment.
  -- Expected: new interest 5,170 on the 1,034,000 remaining principal.
  ----------------------------------------------------------------
  v_villa_e5 := v_villa_e4;
  v_stage_e5 := v_stage_e4;
  PERFORM set_config('app.workspace_today', '2026-09-07', true);

  SELECT interest_accrued, interest_paid, principal_outstanding,
         (principal_outstanding + GREATEST(0, interest_accrued - interest_paid)) AS total_outstanding
    INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e5;
  -- Lifetime charged so far: the 34,000 already charged-and-paid plus the new 5,170 on
  -- the reduced 1,034,000 principal. Confirms no compounding: the new charge is
  -- computed on principal alone, not on the previously charged interest.
  PERFORM pg_temp.assert_eq('E5 cumulative interest charged', 39170.00, r.interest_accrued);
  PERFORM pg_temp.assert_eq('E5 interest paid to date unchanged', 34000.00, r.interest_paid);
  PERFORM pg_temp.assert_eq('E5 new interest still owed', 5170.00, GREATEST(0, r.interest_accrued - r.interest_paid));
  PERFORM pg_temp.assert_eq('E5 total outstanding', 1039170.00, r.total_outstanding);

  PERFORM set_config('app.workspace_today', '2026-08-28', true);

  ----------------------------------------------------------------
  -- E6 — Overpayment creates advance credit.
  -- Continues E1 (2,034,000 total payable). Pay 2,100,000: expect 66,000 advance credit.
  ----------------------------------------------------------------
  v_villa_e6 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e6, v_project, 'E6', 2000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e6, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e6, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_e6 := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_e6, v_villa_e6, 1, 'Stage 1', '2026-07-10', 2000000, 15);

  PERFORM public.record_collection(v_villa_e6, v_customer, '2026-08-28', 2100000, 'cash', NULL, 'e6-key', v_user, NULL, NULL, 'E6-R1', NULL, NULL);

  SELECT interest_paid, principal_paid, status INTO r FROM public.v_stage_position WHERE stage_id = v_stage_e6;
  PERFORM pg_temp.assert_eq('E6 interest paid', 34000.00, r.interest_paid);
  PERFORM pg_temp.assert_eq('E6 principal paid', 2000000.00, r.principal_paid);
  PERFORM pg_temp.assert_eq_text('E6 stage status paid', 'paid', lower(r.status));

  SELECT COALESCE(sum(amount), 0) INTO r FROM (SELECT amount FROM public.advance_credits WHERE villa_id = v_villa_e6) s;
  PERFORM pg_temp.assert_eq('E6 advance credit amount', 66000.00, (SELECT COALESCE(sum(amount),0) FROM public.advance_credits WHERE villa_id = v_villa_e6));

  ----------------------------------------------------------------
  -- E7 — Payment spanning two stages.
  -- Stage A: 2,000,000 principal, 34,000 interest accrued (same shape as E1).
  -- Stage B: 10,000,000 principal, not yet due, no interest.
  -- Pay 3,000,000: Stage A fully paid (2,034,000), remainder 966,000 rolls to Stage B.
  ----------------------------------------------------------------
  v_villa_e7 := gen_random_uuid();
  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa_e7, v_project, 'E7', 12000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa_e7, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa_e7, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  v_stage_a := gen_random_uuid();
  v_stage_b := gen_random_uuid();
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_a, v_villa_e7, 1, 'Stage A', '2026-07-10', 2000000, 15);
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage_b, v_villa_e7, 2, 'Stage B', '2026-12-01', 10000000, 15);

  PERFORM public.record_collection(v_villa_e7, v_customer, '2026-08-28', 3000000, 'cash', NULL, 'e7-key', v_user, NULL, NULL, 'E7-R1', NULL, NULL);

  SELECT interest_paid, principal_paid, status INTO r FROM public.v_stage_position WHERE stage_id = v_stage_a;
  PERFORM pg_temp.assert_eq('E7 Stage A interest paid', 34000.00, r.interest_paid);
  PERFORM pg_temp.assert_eq('E7 Stage A principal paid', 2000000.00, r.principal_paid);
  PERFORM pg_temp.assert_eq_text('E7 Stage A status paid', 'paid', lower(r.status));

  SELECT principal_paid, status INTO r FROM public.v_stage_position WHERE stage_id = v_stage_b;
  PERFORM pg_temp.assert_eq('E7 Stage B principal paid (remainder rolled over)', 966000.00, r.principal_paid);

  -- Confirms E6's rule too: no unpaid stage remains for a spillover-shaped payment only
  -- when Stage B is genuinely exhausted. Here Stage B is NOT exhausted, so no advance
  -- credit should exist for this villa.
  PERFORM pg_temp.assert_eq('E7 no advance credit while a stage remains unpaid', 0, (SELECT count(*) FROM public.advance_credits WHERE villa_id = v_villa_e7));

  ----------------------------------------------------------------
  -- Reconciliation must be empty after every scenario above.
  ----------------------------------------------------------------
  PERFORM pg_temp.assert_eq('ledger reconciliation clean after E1-E7', 0, (SELECT count(*) FROM public.v_ledger_reconciliation));

  RAISE NOTICE '=== ALL E1-E7 EXAMPLES PASSED ===';
END $$;

-- E9 is deliberately not covered here: backdating limits are an unresolved product
-- policy (see docs/INTEREST-EXAMPLES.md), not an algorithm to test. E8 (rounding) and
-- E10 (edit/supersede) are DECIDED and implemented; E10 follows below as its own
-- scenario, independent of the E1-E7 fixtures above.

DO $$
DECLARE
  v_project uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_villa uuid := gen_random_uuid();
  v_stage uuid := gen_random_uuid();
  v_original_id uuid;
  v_new_id uuid;
  r record;
BEGIN
  INSERT INTO public.projects (id, name, location, status) VALUES (v_project, 'E10 Project', 'Test', 'active');
  INSERT INTO public.customers (id, full_name, email) VALUES (v_customer, 'E10 Customer', 'e10@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_auth, 'e10-recorder@example.com');
  INSERT INTO public.users (id, auth_user_id, full_name, email, role, status, scope)
    VALUES (v_user, v_auth, 'Recorder', 'e10-recorder@example.com', 'editor', 'active', 'global');

  INSERT INTO public.villas (id, project_id, villa_number, villa_value) VALUES (v_villa, v_project, 'E10', 2000000);
  INSERT INTO public.villa_customers (villa_id, customer_id) VALUES (v_villa, v_customer);
  INSERT INTO public.villa_interest_terms (villa_id, monthly_rate, grace_days, prorata_divisor, interest_start, first_reminder_day, second_reminder_day, final_notice_day, allocation_order)
    VALUES (v_villa, 0.015, 15, 30, 'after_grace', 14, 21, 28, 'interest_first');
  INSERT INTO public.payment_stages (id, villa_id, stage_no, stage_name, due_date, principal_amount, grace_period_days)
    VALUES (v_stage, v_villa, 1, 'Stage 1', '2026-07-10', 2000000, 15);

  -- Original: 2,000,000 paid on 10 Aug 2026. Grace ends 25 Jul; 16 chargeable days ->
  -- 16,000 interest. Payment fully settles principal + interest (2,016,000 owed vs
  -- 2,000,000 paid would actually underpay by 16,000 -- match the doc's own framing:
  -- the example says this "cleared the stage", so pay the full 2,016,000 owed.
  PERFORM set_config('app.workspace_today', '2026-08-10', true);
  SELECT interest_accrued INTO r FROM public.v_stage_position WHERE stage_id = v_stage;
  PERFORM pg_temp.assert_eq('E10 setup: 16 days -> 16,000 interest at original payment date', 16000.00, r.interest_accrued);

  v_original_id := public.record_collection(v_villa, v_customer, '2026-08-10', 2016000, 'cash', NULL, 'e10-key', v_user, NULL, NULL, 'E10-R1', NULL, NULL);

  SELECT status, principal_paid, interest_paid INTO r FROM public.v_stage_position WHERE stage_id = v_stage;
  PERFORM pg_temp.assert_eq_text('E10 original payment fully settles the stage', 'paid', lower(r.status));

  -- Move to 31 Aug: the mistake is found.
  PERFORM set_config('app.workspace_today', '2026-08-31', true);

  -- Edit: corrected amount is 1,500,000, same payment date (10 Aug).
  v_new_id := public.update_collection(v_original_id, v_villa, v_customer, '2026-08-10', 1500000, 'cash', NULL, v_user, 'Data entry correction', NULL, NULL);

  -- Original row retained, superseded, excluded from totals.
  SELECT superseded_at IS NOT NULL AS is_superseded, supersedes_id, receipt_no INTO r FROM public.collections WHERE id = v_original_id;
  PERFORM pg_temp.assert_true('E10 original row retained and marked superseded', r.is_superseded);

  SELECT supersedes_id, receipt_no, amount INTO r FROM public.collections WHERE id = v_new_id;
  PERFORM pg_temp.assert_true('E10 new row points supersedes_id at the original', r.supersedes_id = v_original_id);
  PERFORM pg_temp.assert_eq_text('E10 new row keeps the SAME receipt number', 'E10-R1', r.receipt_no);
  PERFORM pg_temp.assert_eq('E10 new row has the corrected amount', 1500000.00, r.amount);

  -- Only the new collection's allocations should be live.
  PERFORM pg_temp.assert_eq('E10 superseded collection has no live allocations', 0,
    (SELECT count(*) FROM public.v_live_allocations WHERE collection_id = v_original_id));
  PERFORM pg_temp.assert_true('E10 new collection has live allocations', 
    (SELECT count(*) FROM public.v_live_allocations WHERE collection_id = v_new_id) > 0);

  -- Interest is RE-DERIVED, not carried over: 500,000 of the original 2,000,000
  -- principal is no longer settled, so it has kept accruing interest since 10 Aug.
  -- Grace ended 25 Jul; by 31 Aug that is 37 days on the outstanding 500,000.
  SELECT principal_paid, interest_paid, principal_outstanding, interest_accrued, status
    INTO r FROM public.v_stage_position WHERE stage_id = v_stage;
  PERFORM pg_temp.assert_eq('E10 principal paid after edit', 1484000.00, r.principal_paid);
  PERFORM pg_temp.assert_eq('E10 principal outstanding after edit', 516000.00, r.principal_outstanding);
  PERFORM pg_temp.assert_true('E10 stage no longer fully paid', lower(r.status) <> 'paid');
  -- Re-derived, not carried over: interest_charged_to rewound to the edited payment's
  -- date (10 Aug), so 21 days accrue on the 516,000 still outstanding by 31 Aug —
  -- 16,000 already charged/paid + round(516,000 x 0.015 x 21 / 30, 2) = 21,418.00.
  -- A carried-over bug would show 16,000 (unchanged) or a figure computed from the
  -- ORIGINAL 2,000,000 principal instead of the corrected 1,500,000.
  PERFORM pg_temp.assert_eq('E10 interest re-derived from corrected values', 21418.00, r.interest_accrued);

  -- Audit log records the correction.
  PERFORM pg_temp.assert_true('E10 audit log has an entry for this collection',
    (SELECT count(*) FROM public.audit_log WHERE table_name = 'collections' AND record_id = v_original_id) > 0);

  -- Reconciliation clean after the edit.
  PERFORM pg_temp.assert_eq('E10 ledger reconciliation clean after edit', 0, (SELECT count(*) FROM public.v_ledger_reconciliation));

  RAISE NOTICE '=== E10 PASSED ===';
END $$;
