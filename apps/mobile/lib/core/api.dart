import 'package:intl/intl.dart';
import '../l10n/language.dart';
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

Map<String, String> get messages => {
  'WHATSAPP_UNAVAILABLE': appText('s30'),
  'PHONE_OTP_DISABLED': appText('s31'),
  'PHONE_OTP_SEND_FAILED': appText('s32'),
  'PHONE_OTP_WAIT': appText('s33'),
  'PHONE_OTP_INVALID': appText('s34'),
  'PHONE_ACCOUNT_NOT_FOUND': appText('s1064'),
  'BRANCH_QR_REQUIRED': appText('s35'),
  'QR_WRONG_BRANCH': appText('s36'),
  'BRANCH_LOCATION_REQUIRED': appText('s37'),
  'LOCATION_PERMISSION_REQUIRED': appText('s38'),
  'LOCATION_STALE': appText('s39'),
  'LOCATION_INACCURATE': appText('s40'),
  'GO_TO_BRANCH': appText('s41'),

  'BOOKING_SERVICE_UNAVAILABLE': appText('s42'),
  'BOOKING_HOURS_NOT_CONFIGURED': appText('s43'),
  'OUTSIDE_OPENING_HOURS': appText('s44'),
  'SESSION_ENDS_AFTER_CLOSING': appText('s45'),
  'SERVICE_SELECTION_REQUIRED': appText('s46'),
  'MAINTENANCE_REAPPROVAL_REQUIRED': appText('s47'),
  'MARKET_LISTING_LIMIT': appText('s48'),
  'INVALID_CREDENTIALS': appText('s49'),
  'ACCOUNT_UNAVAILABLE':
      appText('s50'),
  'INVALID_INPUT': appText('s51'),
  'UNAUTHENTICATED': appText('s52'),
  'ACCESS_DENIED': appText('s53'),
  'BRANCH_ACCESS_DENIED': appText('s54'),
  'RATE_LIMITED': appText('s55'),
  'INSUFFICIENT_POINTS': appText('s56'),
  'INSUFFICIENT_FUNDS': appText('s57'),
  'STALE_SETTINGS': appText('s58'),
  'WALLET_EXPIRY_REVIEW_REQUIRED':
      appText('s59'),
  'QR_INVALID': appText('s60'),
  'QR_ALREADY_USED': appText('s61'),
  'CANCEL_WINDOW_CLOSED': appText('s62'),
  'VISIT_ALREADY_CANCELLED': appText('s63'),
  'OPERATION_REVIEW_EXISTS': appText('s64'),
  'SETTLEMENT_REVIEW_REQUIRED': appText('s65'),
  'GYM_INACTIVE': appText('s66'),
  'BRANCH_NOT_READY': appText('s67'),
  'TRAINEE_UNAVAILABLE': appText('s68'),
  'PAYMENT_METHOD_UNAVAILABLE': appText('s69'),
  'PRICING_NOT_CONFIGURED': appText('s70'),
  'INVALID_STATE': appText('s71'),
  'NOT_FOUND': appText('s72'),
  'PENDING_REQUEST_EXISTS': appText('s73'),
  'INVALID_RECEIPT': appText('s74'),
  'RECEIPT_ALREADY_USED': appText('s75'),
  'BODY_TOO_LARGE': appText('s76'),
  'IDEMPOTENCY_CONFLICT': appText('s77'),
  'PAYMENT_AMOUNT_MISMATCH': appText('s78'),
  'SERVICE_UNAVAILABLE': appText('s79'),
};

class ApiFailure implements Exception {
  final String code;
  final int status;
  final bool uncertain;
  const ApiFailure(this.code, {this.status = 0, this.uncertain = false});
  @override
  String toString() => uncertain
      ? appText('s80')
      : messages[code] ?? appText('s81');
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
  Json? deletionReceipt;
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
      if (await checkDeletionReceipt()) return;
      if (token != null) {
        try {
          user = Map<String, dynamic>.from(await request('me'));
        } on ApiFailure catch (e) {
          // A rejected saved session should return to sign-in, not block startup.
          // request() clears the session only for an authenticated 401 response.
          if (e.status != 401 || e.code != 'UNAUTHENTICATED' || token != null) rethrow;
          return;
        }
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
    deletionReceipt = null;
    final deletionSaved = await storage.read('deletion.pending');
    if(deletionSaved != null && jsonDecode(deletionSaved)['actorId'] != r['user']['id']) await storage.remove('deletion.pending');
    token = r['accessToken'];
    user = Map<String, dynamic>.from(r['user']);
    await _readPending();
    notifyListeners();
  }

  Future<dynamic> deleteAccount(String phone) async {
    final actorId = user!['id'] as String;
    final saved = await storage.read('deletion.$actorId');
    final key = saved ?? newKey();
    await storage.write('deletion.$actorId', key);
    await storage.write('deletion.pending', jsonEncode({'actorId':actorId,'requestKey':key}));
    final result = await request('me/account-deletion',method:'POST',body:{
      'phone':phone,'confirmation':'DELETE','requestKey':key,
    });
    await _acceptDeletionReceipt(Map<String,dynamic>.from(result),actorId);
    return result;
  }

  Future<bool> checkDeletionReceipt() async {
    final raw = await storage.read('deletion.pending');
    if (raw == null) return false;
    final saved = Map<String,dynamic>.from(jsonDecode(raw));
    // A receipt belongs to one identity; never clear a different user's session.
    if (user != null && user!['id'] != saved['actorId']) return false;
    try {
      final result = await request('auth/account-deletion/status',method:'POST',auth:false,
        body:{'requestKey':saved['requestKey']});
      return await _acceptDeletionReceipt(Map<String,dynamic>.from(result),saved['actorId'] as String);
    } on ApiFailure catch(e) {
      if(e.status==404 && e.code=='NOT_FOUND')return false;
      rethrow;
    }
  }

  Future<bool> _acceptDeletionReceipt(Json result,String actorId) async {
    if(result['request']?['erasedAt']==null)return false;
    deletionReceipt=result;
    token=null;user=null;pending=null;
    try {
      await storage.remove('session');
      await storage.remove('pending.$actorId');
    } finally {notifyListeners();}
    return true;
  }

  Future<void> dismissDeletionReceipt() async {
    await storage.remove('deletion.pending');
    deletionReceipt=null;
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
  if (d == null) return '—';
  if (AppLanguage.instance.english) return '${DateFormat.yMMMd("en").format(d)} · ${DateFormat.Hm("en").format(d)}';
  return '${d.day}/${d.month}/${d.year} · ${d.hour.toString().padLeft(2, "0")}:${d.minute.toString().padLeft(2, "0")}';
}

String statusName(dynamic s) =>
    {
      'PENDING': appText('s82'),
      'APPROVED': appText('s83'),
      'REJECTED': appText('s84'),
      'ACTIVE': appText('s85'),
      'SUSPENDED': appText('s86'),
      'REQUESTED': appText('s87'),
      'PAID': appText('s88'),
      'DISPUTED': appText('s89'),
      'CANCELLED': appText('s90'),
      'EXPIRED': appText('s91'),
      'RECORDED': appText('s92'),
      'OPEN': appText('s93'),
      'WAITING_ADMIN': appText('s94'),
      'WAITING_USER': appText('s95'),
      'CLOSED': appText('s96'),
    }['$s'] ??
    '$s';


