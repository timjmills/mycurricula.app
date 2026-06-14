// Settings → Standards — choose the curriculum frameworks the school + the teacher
// plan against. Server component: fetches the catalog + selection + caller role
// under RLS, then hands them to the client <StandardsSettings> for interaction.
//
// School default is admin-set (team-scoped); each teacher overrides for themselves
// (personal). Only a teacher's effective frameworks appear when tagging lesson
// standards (the tagging picker + search are scoped to the same effective set).

import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { StandardsSettings } from "@/components/standards/StandardsSettings";
import reveal from "@/components/settings/section-reveal.module.css";
import {
  listFrameworkCatalog,
  getSchoolFrameworkDefaults,
  getTeacherFrameworkOverrides,
  getStandardsCaller,
} from "@/lib/standards/queries";
import styles from "./page.module.css";

export default async function StandardsSettingsPage(): Promise<ReactNode> {
  const [frameworks, schoolDefaults, overrides, caller] = await Promise.all([
    listFrameworkCatalog(),
    getSchoolFrameworkDefaults(),
    getTeacherFrameworkOverrides(),
    getStandardsCaller(),
  ]);

  return (
    <div className={styles.page}>
      <div className={`${styles.inner} ${reveal.reveal}`}>
        <PageHeader
          eyebrow="Settings"
          title="Standards"
          subtitle="Choose the curriculum frameworks your school and you plan against. Only your frameworks appear when you tag standards on lessons."
        />
        <StandardsSettings
          frameworks={frameworks}
          schoolDefaults={schoolDefaults}
          overrides={overrides}
          isSchoolAdmin={caller?.isSchoolAdmin ?? false}
          hasSchool={!!caller?.schoolId}
        />
      </div>
    </div>
  );
}
