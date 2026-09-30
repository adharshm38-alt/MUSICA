const FIELDS = [
  {
    name: 'username',
    label: 'Username',
    type: 'text',
    placeholder: 'yourhandle',
    autoComplete: 'username',
    hint: 'Lowercase letters, numbers and underscores. This is your public @name.',
    maxLength: 30,
  },
  {
    name: 'displayName',
    label: 'Display name',
    type: 'text',
    placeholder: 'Your Name',
    autoComplete: 'name',
    hint: 'How your name appears across MUSICA.',
    maxLength: 50,
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'you@example.com',
    autoComplete: 'email',
    hint: 'Used for sign in and account recovery.',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'At least 8 characters',
    autoComplete: 'new-password',
    hint: 'Minimum 8 characters. Store it somewhere safe.',
  },
]

export default FIELDS
