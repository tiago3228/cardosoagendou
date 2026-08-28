# Booked Solid

MASTER PROMPT — SaaS APPOINTMENT PLATFORM EXPANSION & FINALIZATION

You are now responsible for continuing and finalizing the SaaS project contained in the files I am providing.

IMPORTANT:

Treat the uploaded project as the SINGLE SOURCE OF TRUTH. Do not recreate the project from scratch and do not discard existing functionality.

The project started as a Barbershop Appointment SaaS, but the strategic goal is to transform it into a GENERIC MULTI-TENANT APPOINTMENT PLATFORM that can serve:

- Barbershops

- Hair salons

- Beauty salons

- Aesthetic clinics

- Nail salons

- Massage/therapy businesses

- Tattoo/piercing studios

- Physiotherapy/therapy practices

- Other appointment-based businesses

The system must therefore be designed around generic concepts such as BUSINESS, PROFESSIONAL, SERVICE, CLIENT, APPOINTMENT, PRODUCT, PLAN and SUBSCRIPTION rather than hard-coded "barbershop" logic.

==================================================

1. CURRENT PROJECT STATUS

==================================================

A complete validation was already performed on the existing project.

Confirmed working:

- npm install

- Prisma validation

- Prisma generate

- Prisma migrations

- Database seed

- Seed idempotency

- 56 automated tests passing

- TypeScript compilation

- ESLint

- Production build

- Multi-tenant isolation

- RBAC

- Owner/Professional permissions

- Service CRUD

- Cross-tenant protection

- Soft delete

- Audit logging

- Appointment creation

- Availability calculation

- Double-booking prevention

- Appointment status workflow

- Cancellation

- Rescheduling

- Appointment snapshots

- Notifications

- Financial transactions

- Professional commissions

- Subscription checkout flow

- Payment webhook

- Webhook idempotency

- Internal jobs

- Inventory

- Stock protection

- New business signup

- Immediate login after signup

- Master administration

The validation result was:

APPROVED WITH RESERVATIONS.

One validation failure was identified as a TEST BUG, not an application bug:

the duplicate-slug test sent an invalid ownerName with only one character, causing Zod validation to return HTTP 400 before the duplicate-slug check. The application route itself was correct.

The existing project also has npm audit vulnerabilities. DO NOT blindly run "npm audit fix --force", because it proposes major breaking upgrades (Next.js 16, Vitest 4, etc.). Handle dependency security carefully and preserve compatibility.

Before modifying functionality, inspect the existing architecture, Prisma schema, API routes, authentication, middleware, subscription system, tests and UI.

==================================================

2. BUSINESS MODEL

==================================================

The business strategy is LOW-COST + HIGH-VOLUME.

Initial monthly plans:

BASIC

- R$19.90/month

- 1 professional

MEDIUM

- R$39.90/month

- 1 to 5 professionals

UNLIMITED

- R$59.90/month

- More than 5 professionals

The architecture MUST allow these plans and limits to be changed later without rewriting the application.

The business owner must be able to:

- Upgrade their plan

- Downgrade their plan

- Cancel whenever they want

- Have no cancellation penalty

- Have the new plan price take effect from the next billing cycle

- Keep the current plan active until the current billing period ends when changing plans

- Clearly see the current plan and next plan/billing change

Do not allow a downgrade that violates the new professional limit without handling the situation clearly.

==================================================

3. SIGNUP / ONBOARDING

==================================================

The customer should acquire the application through a signup link.

Signup should be extremely simple:

- Business name

- Owner name

- Email

- Password

- WhatsApp

WhatsApp must support Brazilian international format, for example:

55 (31) 975414498

Normalize/validate the number internally while allowing a user-friendly Brazilian input format.

After signup, the business should be able to immediately access the system.

==================================================

4. BUSINESS CUSTOMIZATION

==================================================

Each tenant/business must be able to configure:

- Business name

- Logo

- Cover/header image if appropriate

- Business description

- Contact information

- WhatsApp

- Address

- Opening hours

- Booking policies

The public booking page should look professional and use the business branding.

Do not hard-code "Barbershop" terminology throughout the application.

==================================================

5. PROFESSIONALS

==================================================

Each business must be able to create professionals/employees.

Each professional should have:

- Name

- Photo

- Active/inactive status

- Services they perform

- Working hours/availability

- Appointment schedule

The system must enforce the professional limit according to the subscription plan.

==================================================

6. SERVICES AND APPOINTMENTS

==================================================

Businesses must be able to create and manage services.

Each service should support:

- Name

- Description

- Price

- Duration

- Active/inactive

- Category

- Professionals who can perform it

- Optional image

IMPORTANT:

Appointment duration must be calculated dynamically.

Example:

Service A = 30 minutes

Service B = 45 minutes

If a client selects both:

TOTAL DURATION = 75 minutes

The availability engine must use this total duration and automatically remove unavailable time slots from the booking flow.

This must remain generic enough for salons, aesthetics, massage, tattoo, therapy, etc.

==================================================

7. PRODUCTS

==================================================

Keep and improve the existing product/inventory functionality.

Businesses should be able to:

- Register products

- Set prices

- Manage stock

- Track stock movements

Products should be independent from services, but the architecture should allow future integration between services and products.

==================================================

8. PAYMENTS / SUBSCRIPTIONS

==================================================

Implement the architecture for real payment integration.

Customers should be able to pay subscriptions using:

- PIX

- Credit card

The payment provider must be abstracted so the system is not tightly coupled to one gateway.

The existing checkout/webhook architecture should be preserved and improved rather than replaced.

Subscription lifecycle must support:

- Trial if configured

- Active

- Upgrade

- Downgrade

- Renewal

- Cancellation

- Payment failure

- Suspension

- Reactivation

- Webhook idempotency

IMPORTANT:

Plan changes should normally apply on the NEXT BILLING CYCLE.

==================================================

9. ANNUAL PLANS

==================================================

Add support for annual subscriptions.

Annual plans may offer discounts such as:

- 12 months for the price of 10

- or

- 12 months for the price of 11

The exact discount should be configurable.

The system should allow different promotional strategies per plan.

==================================================

10. GENERIC SAAS ARCHITECTURE

==================================================

The most important architectural goal is:

DO NOT build a system that only works for barbershops.

The same core should support different business types.

Consider introducing/configuring a business category/type such as:

BARBERSHOP

HAIR_SALON

BEAUTY_SALON

AESTHETIC_CLINIC

NAIL_SALON

MASSAGE

TATTOO

THERAPY

OTHER

The business type should influence terminology, categories and branding where appropriate, but NOT duplicate the application logic.

The appointment engine, subscription system, authentication, multi-tenancy, clients, professionals and services should remain shared.

==================================================

11. PUBLIC BOOKING EXPERIENCE

==================================================

The customer-facing booking flow should be extremely simple:

1. Select service(s)

2. Select professional (or "any professional")

3. Select date

4. See available times

5. Enter name

6. Enter WhatsApp

7. Confirm appointment

The system must calculate service duration and availability correctly.

The booking experience should work well on mobile phones.

==================================================

12. UI / UX

==================================================

The application should look like a professional commercial SaaS product.

Prioritize:

- Clean interface

- Responsive design

- Mobile-first booking experience

- Simple navigation

- Clear dashboards

- Professional typography

- Business branding

- Easy onboarding

- Minimal complexity for small business owners

Avoid unnecessary enterprise complexity.

The target customer is a small business owner who may have little technical knowledge.

==================================================

13. SECURITY / MULTI-TENANCY

==================================================

DO NOT weaken the security already implemented.

Preserve and test:

- Tenant isolation

- RBAC

- Authentication

- Authorization

- Cross-tenant protection

- Audit logs

- Secure subscription handling

- Webhook verification/idempotency

- Input validation

- Password security

- Secret protection

Never allow tenant A to access, modify or delete tenant B data.

==================================================

14. TESTING REQUIREMENT

==================================================

Before declaring the project finished:

Run and verify:

npm install

npx prisma validate

npx prisma generate

npx prisma migrate status

npm run test

npx tsc --noEmit

npm run lint

npm run build

Also run the existing HTTP/integration validation.

Add new automated tests for all newly implemented functionality, especially:

- Plan limits

- Upgrade

- Downgrade

- Cancellation

- Annual plans

- Professional limits

- Service duration calculation

- Multi-service appointments

- Signup validation

- Payment methods

- Subscription lifecycle

- Tenant isolation

- Generic business types

Do not remove existing tests just to make the project pass.

==================================================

15. DEPENDENCY SECURITY

==================================================

Review npm audit findings carefully.

DO NOT execute:

npm audit fix --force

without first evaluating the breaking changes.

Prefer compatible security updates and explain any dependency that must remain pinned because of compatibility.

==================================================

16. DEVELOPMENT RULES

==================================================

Before changing code:

1. Inspect the existing project.

2. Understand the architecture.

3. Identify what is already implemented.

4. Reuse existing functionality whenever possible.

5. Avoid unnecessary rewrites.

6. Preserve database compatibility.

7. Preserve existing APIs unless there is a strong reason to change them.

8. Add migrations when the schema changes.

9. Update tests together with functionality.

10. Keep the application production-oriented.

Do not simply tell me what should be done.

IMPLEMENT the necessary changes in the provided project.

When you finish, provide a concise final report containing:

- What was already working

- What you changed

- What remains to be implemented

- Tests executed

- Tests passed/failed

- Build status

- Security/dependency status

- Any production blockers

- Recommended next steps

The ultimate goal is to turn the current Barbershop SaaS into a scalable, affordable, generic appointment SaaS that can serve thousands of small businesses with simple onboarding, low monthly pricing and reliable online scheduling.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cardosoagendou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2386b466-0c1e-492f-beb7-e7eaf166fc97).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
