# Glimpse Auth API

Base URL: `${API_BASE_URL}/api/auth`

## Endpoints

- `POST /register` or `POST /signup`
- `POST /login`
- `POST /forgot-password`

## Forgot Password Contract

`POST /forgot-password` updates the password immediately after validating the account identity. It does not create reset tokens, send verification emails, validate reset links, or apply reset-link expiry windows.

Required body fields:

```js
{
  username: 'ada',
  email: 'ada@example.com',
  newPassword: 'NewPassword123',
}
```

Validation rules:

- `username` must match an existing account.
- `email` must be the registered email for that username.
- `newPassword` must be at least 8 characters and is hashed before storage.

## Axios Examples

```js
await API.post('/api/auth/register', {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Password123',
});
```

```js
const { data } = await API.post('/api/auth/login', {
  email: 'ada@example.com',
  password: 'Password123',
});

localStorage.setItem('token', data.token);
```

```js
await API.post('/api/auth/forgot-password', {
  username: 'ada',
  email: 'ada@example.com',
  newPassword: 'NewPassword123',
});
```

## Fetch Examples

```js
await fetch(`${API_BASE_URL}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Password123',
  }),
});
```

```js
await fetch(`${API_BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'ada@example.com',
    password: 'Password123',
  }),
});
```

```js
await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'ada',
    email: 'ada@example.com',
    newPassword: 'NewPassword123',
  }),
});
```
