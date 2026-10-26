export const toggleMusicSelection = (selected: string[], id: string, checked: boolean, displayedIds: string[]): string[] => {
  const included = new Set(selected);

  if (checked) {
    included.add(id);
  } else {
    included.delete(id);
  }

  return [...displayedIds, ...selected.filter((item) => !displayedIds.includes(item))]
    .filter((item, index, all) => included.has(item) && all.indexOf(item) === index);
};