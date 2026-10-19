import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

typedef Json = Map<String, dynamic>;
String newKey() {
  final b = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  final h = b.map((n) => n.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

String digits(String s) => s.replaceAllMapped(
  RegExp('[٠-٩۰-۹]'),
  (m) => '${m[0]!.codeUnitAt(0) - (m[0]!.codeUnitAt(0) >= 1776 ? 1776 : 1632)}',
);
String money(dynamic value) {
  final n = BigInt.tryParse('$value') ?? BigInt.zero;
  final sign = n.isNegative ? '-' : '';
  final a = n.abs();
  final rest = a % BigInt.from(100);
  return '$sign${a ~/ BigInt.from(100)}${rest == BigInt.zero ? '' : '.${rest.toString().padLeft(2, '0')}'}';
}

String? piasters(String value) {
  final s = digits(value.trim());
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(s)) return null;
  final p = s.split('.');
  return (BigInt.parse(p[0]) * BigInt.from(100) +
          BigInt.parse(p.length == 1 ? '0' : p[1].padRight(2, '0')))
      .toString();
}

const messages = {
  'INVALID_CREDENTIALS': 'الإيميل أو رقم الموبايل أو كلمة السر غير صحيح.',
  'ACCOUNT_UNAVAILABLE':
      'الإيميل أو رقم الموبايل مسجل بالفعل. جرّب تسجيل الدخول.',
  'INVALID_INPUT': 'راجع الحقول المطلوبة والقيم المدخلة.',
  'UNAUTHENTICATED': 'انتهت الجلسة. سجّل الدخول مرة تانية.',
  'ACCESS_DENIED': 'حسابك غير مسموح له بالخطوة دي.',
  'BRANCH_ACCESS_DENIED': 'صلاحيتك على الفرع غير متاحة. حدّث الفروع أو راجع صاحب الجيم.',
  'RATE_LIMITED': 'محاولات كتير في وقت قصير. انتظر قليلًا وحاول تاني.',
  'INSUFFICIENT_POINTS': 'رصيد الجيم المتاح مش كافي لإرسال النقاط.',
  'INSUFFICIENT_FUNDS': 'المبلغ المطلوب أكبر من مستحقاتك المتاحة.',
  'STALE_SETTINGS': 'الإعدادات اتغيرت. ارجع وحدّث البيانات وراجع العملية.',
  'WALLET_EXPIRY_REVIEW_REQUIRED':
      'الرصيد المنتهي يحتاج مراجعة الإدارة قبل شحن جديد.',
  'QR_INVALID': 'الرمز انتهى. افتح رمز جديد وحاول تاني.',
  'QR_ALREADY_USED': 'الرمز اتستخدم بالفعل. اطلب من المتدرب يفتح رمز جديد.',
  'CANCEL_WINDOW_CLOSED': 'مدة الإلغاء المباشر انتهت. ارجع وافتح طلب مراجعة للإدارة.',
  'VISIT_ALREADY_CANCELLED': 'الزيارة ملغية بالفعل. حدّث السجل.',
  'OPERATION_REVIEW_EXISTS': 'فيه طلب مراجعة للعملية دي بالفعل.',
  'SETTLEMENT_REVIEW_REQUIRED': 'الزيارة محتاجة مراجعة التسوية من الإدارة قبل رد النقاط.',
  'GYM_INACTIVE': 'الجيم غير نشط حاليًا. تواصل مع الإدارة.',
  'BRANCH_NOT_READY': 'الفرع محتاج اعتماد الموقع وسعر الزيارة من الإدارة.',
  'TRAINEE_UNAVAILABLE': 'مفيش حساب متدرب نشط بالرقم ده.',
  'PAYMENT_METHOD_UNAVAILABLE': 'طريقة التحويل غير متاحة حاليًا.',
  'PRICING_NOT_CONFIGURED': 'أسعار النقاط لم تُحدد بعد. تواصل مع الإدارة.',
  'INVALID_STATE': 'حالة الطلب اتغيرت. حدّث الصفحة.',
  'NOT_FOUND': 'البيانات المطلوبة غير موجودة.',
  'PENDING_REQUEST_EXISTS': 'فيه طلب قيد المراجعة بالفعل.',
  'INVALID_RECEIPT': 'ارفع صورة واضحة بصيغة JPG أو PNG أو WebP.',
  'RECEIPT_ALREADY_USED': 'الصورة دي مرتبطة بطلب سابق. راجع طلبات الشحن.',
  'BODY_TOO_LARGE': 'اختار صورة أقل من 4 ميجابايت.',
  'IDEMPOTENCY_CONFLICT': 'الطلب السابق بياناته مختلفة. راجع سجل العمليات.',
  'PAYMENT_AMOUNT_MISMATCH': 'المبلغ لا يطابق السعر الحالي. راجع العملية.',
  'SERVICE_UNAVAILABLE': 'تعذر الاتصال بالخدمة. حاول تاني.',
};

class ApiFailure implements Exception {
  final String code;
  final int status;
  final bool uncertain;
  const ApiFailure(this.code, {this.status = 0, this.uncertain = false});
  @override
  String toString() => uncertain
      ? 'نتيجة العملية غير مؤكدة. استخدم «إعادة نفس العملية» بأمان قبل أي عملية جديدة.'
      : messages[code] ?? 'تعذر إتمام الخطوة. حاول تاني أو تواصل مع الدعم.';
}

abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

class SecureTokenStore implements TokenStore {
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
  @override
  Future<void> remove(String key) => _storage.delete(key: key);
}

class ApiClient extends ChangeNotifier {
  final http.Client transport;
  final TokenStore storage;
  final Uri origin;
  String? token;
  Json? user;
  Json? pending;
  bool restored = false;
  bool _persistSession = true;
  bool _mutationRunning = false;
  ApiClient({
    http.Client? transport,
    TokenStore? storage,
    String base = const String.fromEnvironment(
      'GYM_API_ORIGIN',
      defaultValue: 'https://gym-network-platform.vercel.app',
    ),
  }) : transport = transport ?? http.Client(),
       storage = storage ?? SecureTokenStore(),
       origin = Uri.parse(base) {
    if (origin.scheme != 'https' &&
        !(kDebugMode &&
            ['localhost', '127.0.0.1', '10.0.2.2'].contains(origin.host)))
      throw ArgumentError('HTTPS API origin required');
  }
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Json? body,
    Uint8List? bytes,
    String? mime,
    String? key,
    bool auth = true,
  }) async {
    if (path.startsWith('/') || path.contains('..') || path.contains('://'))
      throw ArgumentError('Invalid API path');
    final currentToken = token;
    try {
      final r = await transport
          .send(
            http.Request(method, origin.resolve('/api/mobile/$path'))
              ..followRedirects = false
              ..headers.addAll({
                'accept': 'application/json',
                if (auth && currentToken != null)
                  'authorization': 'Bearer $currentToken',
                if (key != null) 'idempotency-key': key,
                if (method != 'GET') 'content-type': mime ?? 'application/json',
              })
              ..bodyBytes =
                  bytes ??
                  (method == 'GET'
                      ? <int>[]
                      : utf8.encode(jsonEncode(body ?? {}))),
          )
          .timeout(const Duration(seconds: 35));
      final text = await r.stream.bytesToString().timeout(
        const Duration(seconds: 35),
      );
      dynamic data;
      try {
        data = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
      } catch (_) {
        throw ApiFailure(
          'SERVICE_UNAVAILABLE',
          status: r.statusCode,
          uncertain: key != null,
        );
      }
      if (r.statusCode >= 400) {
        if (r.statusCode == 401 &&
            data is Map &&
            data['code'] == 'UNAUTHENTICATED' &&
            auth &&
            currentToken == token) {
          token = null;
          user = null;
          try {
            await storage.remove('session');
          } finally {
            notifyListeners();
          }
        }
        throw ApiFailure(
          data is Map ? '${data['code']}' : 'SERVICE_UNAVAILABLE',
          status: r.statusCode,
          uncertain: key != null && r.statusCode >= 500,
        );
      }
      if (r.statusCode >= 300)
        throw ApiFailure(
          'SERVICE_UNAVAILABLE',
          status: r.statusCode,
          uncertain: key != null,
        );
      return data;
    } on ApiFailure {
      rethrow;
    } catch (_) {
      throw ApiFailure('SERVICE_UNAVAILABLE', uncertain: key != null);
    }
  }

  Future<void> restore() async {
    try {
      token = await storage.read('session');
      if (token != null) {
        user = Map<String, dynamic>.from(await request('me'));
        await _readPending();
      }
    } finally {
      restored = true;
      notifyListeners();
    }
  }

  Future<void> _readPending() async {
    final raw = await storage.read('pending.${user?['id']}');
    pending = raw == null ? null : Map<String, dynamic>.from(jsonDecode(raw));
  }

  Future<void> authenticate(
    String path,
    Json body, {
    bool? rememberSession,
  }) async {
    final r = await request(
      path,
      method: 'POST',
      body: body,
      auth: path == 'auth/password/change',
    );
    final persist = rememberSession ?? _persistSession;
    if (persist) {
      await storage.write('session', r['accessToken']);
    } else {
      await storage.remove('session');
    }
    _persistSession = persist;
    token = r['accessToken'];
    user = Map<String, dynamic>.from(r['user']);
    await _readPending();
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      if (token != null) await request('auth/logout', method: 'POST');
    } finally {
      token = null;
      user = null;
      pending = null;
      try {
        await storage.remove('session');
      } finally {
        notifyListeners();
      }
    }
  }

  Future<Json> transact(String path, Json body) async {
    if (_mutationRunning) throw const ApiFailure('INVALID_STATE');
    _mutationRunning = true;
    try {
      if (pending != null &&
          (pending!['path'] != path ||
              jsonEncode(pending!['body']) != jsonEncode(body)))
        throw const ApiFailure('PENDING_REQUEST_EXISTS', uncertain: true);
      pending ??= {
        'path': path,
        'body': body,
        'key': newKey(),
        'actorId': user!['id'],
      };
      await storage.write('pending.${user!['id']}', jsonEncode(pending));
      notifyListeners();
      final result = await request(
        path,
        method: 'POST',
        body: body,
        key: pending!['key'],
      );
      await storage.remove('pending.${pending!['actorId']}');
      pending = null;
      notifyListeners();
      return Map<String, dynamic>.from(result);
    } on ApiFailure catch (e) {
      if (!e.uncertain && e.status != 401 && pending != null) {
        await storage.remove('pending.${pending!['actorId']}');
        pending = null;
        notifyListeners();
      }
      rethrow;
    } finally {
      _mutationRunning = false;
    }
  }

  Future<Json> retryPending() async {
    final p = pending;
    if (p == null || p['actorId'] != user?['id'])
      throw const ApiFailure('ACCESS_DENIED');
    return transact(p['path'], Map<String, dynamic>.from(p['body']));
  }

  @override
  void dispose() {
    transport.close();
    super.dispose();
  }
}

List<Json> rows(dynamic data) =>
    ((data is Map ? data['items'] : data) as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
String shortDate(dynamic s) {
  final d = DateTime.tryParse('$s')?.toLocal();
  return d == null
      ? '—'
      : '${d.day}/${d.month}/${d.year} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

String statusName(dynamic s) =>
    {
      'PENDING': 'قيد المراجعة',
      'APPROVED': 'مقبول',
      'REJECTED': 'مرفوض',
      'ACTIVE': 'نشط',
      'SUSPENDED': 'موقوف',
      'REQUESTED': 'طلب جديد',
      'PAID': 'تم التحويل',
      'DISPUTED': 'يوجد اعتراض',
      'CANCELLED': 'ملغى',
      'EXPIRED': 'منتهي',
      'RECORDED': 'تمت',
      'OPEN': 'مفتوح',
      'WAITING_ADMIN': 'بانتظار الإدارة',
      'WAITING_USER': 'بانتظار ردك',
      'CLOSED': 'مغلق',
    }['$s'] ??
    '$s';

