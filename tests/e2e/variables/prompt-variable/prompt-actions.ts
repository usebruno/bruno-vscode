import { Frame, expect } from '@playwright/test';
import { buildCommonLocators } from '../../utils/page/locators';

/**
 * Helpers for Bruno's "Input Required" modal, shown when a request references
 * `{{?prompt}}` variables (one input per unique prompt).
 */

/** Assert the modal is visible with exactly `expectedInputs` inputs (one per unique prompt). */
export async function expectPromptModal(editor: Frame, expectedInputs: number): Promise<void> {
  const p = buildCommonLocators(editor).promptVariables;
  await expect(p.modal()).toBeVisible();
  await expect(p.inputContainers()).toHaveCount(expectedInputs);
}

/** Assert the modal never appeared (e.g. for invalid `{{? name}}` patterns). */
export async function expectNoPromptModal(editor: Frame): Promise<void> {
  await expect(buildCommonLocators(editor).promptVariables.modal()).toHaveCount(0);
}

/** Fill the inputs in order and click Continue (an empty string is a valid value). */
export async function fillPromptAndContinue(editor: Frame, values: string[]): Promise<void> {
  const p = buildCommonLocators(editor).promptVariables;
  await expect(p.modal()).toBeVisible();

  for (let i = 0; i < values.length; i++) {
    const input = p.input(i);
    await expect(input).toBeVisible();
    await input.fill(values[i]);
  }

  await p.continueButton().click();
  await expect(p.modal()).toHaveCount(0);
}

/** Dismiss the modal via Cancel (the request must NOT be sent). */
export async function cancelPrompt(editor: Frame): Promise<void> {
  const p = buildCommonLocators(editor).promptVariables;
  await expect(p.modal()).toBeVisible();
  // Exact match to avoid buttons that merely contain "Cancel" (e.g. a "PV Cancel" collection).
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(p.modal()).toHaveCount(0);
}
