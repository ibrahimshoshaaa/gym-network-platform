const platformOrigin = 'https://gym-network-platform.vercel.app';
bool isInternal(Uri? uri) => uri != null && uri.scheme == 'https' && uri.host == 'gym-network-platform.vercel.app' && uri.port == 443 && uri.userInfo.isEmpty;
bool isExternalAllowed(Uri? uri) {
  if (uri == null || uri.userInfo.isNotEmpty) return false;
  if (uri.scheme == 'tel') return RegExp(r'^\+?[0-9]{7,15}$').hasMatch(uri.path);
  return uri.scheme == 'https' && uri.port == 443 && {'www.google.com','maps.google.com','wa.me','res.cloudinary.com','www.openstreetmap.org'}.contains(uri.host);
}
