import pyotp
secret = 'N3ZXA34NPKVJMVPKRHXECMEZS7YIMTUJ'
print(pyotp.TOTP(secret).now())
