const inputsConfig = [
  {
    key: 'authorizationUrl',
    label: 'Authorization URL'
  },
  {
    key: 'clientId',
    label: 'Client ID'
  },
  {
    key: 'scope',
    label: 'Scope'
  },
  {
    key: 'state',
    label: 'State',
    tooltip: 'If left empty, Bruno automatically generates a secure random value to help protect against CSRF attacks.'
  }
];

export { inputsConfig };
