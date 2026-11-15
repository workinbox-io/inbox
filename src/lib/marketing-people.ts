const PEOPLE = {
  anna: "anna@acme.com",
  ben: "ben@acme.com",
  chris: "chris@acme.com",
  marta: "marta@brightloop.io",
} as const;

export function personReferences(text: string) {
  return text.split(/(\b(?:anna|ben|chris|marta)(?:@[a-z0-9.-]+\.[a-z]{2,}|@(?![a-z0-9.-]))?\b@?)/gi).filter(Boolean).map(label => {
    const name = label.toLowerCase().replace(/@.*$/, "") as keyof typeof PEOPLE;
    return { label, seed: PEOPLE[name] };
  });
}
