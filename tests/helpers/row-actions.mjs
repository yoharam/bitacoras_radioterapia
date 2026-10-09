export async function openRowActions(page, row) {
  await row.getByRole('button', { name: /^Acciones(?: RT-| de )/ }).click();
  return page.getByRole('menu');
}

export async function chooseRowAction(page, row, label) {
  const menu = await openRowActions(page, row);
  await menu.getByRole('menuitem', { name: label, exact: true }).click();
}
