package xyz.haoduoyu.personal.offline;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteDatabaseCorruptException;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Internal-only database. One transaction commits the data, outbox, drafts and
 * identity together. Each cursor row is at most 256 KiB: a large state document
 * must never depend on Android's limited CursorWindow fitting one giant TEXT.
 */
public final class SqliteStateStore extends SQLiteOpenHelper implements LocalRepository.Store {
    private static final int CHUNK_BYTES = 256 * 1024;
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private static final int MAX_CHUNKS = MAX_BYTES / CHUNK_BYTES;

    public SqliteStateStore(Context context) {
        // Android's default corruption handler deletes database files. Fail
        // closed instead: never reset or delete a user's unsynchronized data.
        super(context.getApplicationContext(), "haoduoyu-offline.db", null, 1, database -> {
            throw new SQLiteDatabaseCorruptException("本机数据库无法安全读取；原 DB/WAL/SHM 文件保留，未清空或重新初始化");
        });
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase database) {
        database.setForeignKeyConstraintsEnabled(true);
        database.execSQL("PRAGMA synchronous=FULL");
    }

    @Override public void onCreate(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE offline_manifest (id INTEGER PRIMARY KEY CHECK(id=1), "
                + "length_bytes INTEGER NOT NULL CHECK(length_bytes BETWEEN 1 AND 33554432), "
                + "sha256 TEXT NOT NULL CHECK(length(sha256)=64), "
                + "chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 128))");
        database.execSQL("CREATE TABLE offline_chunks (chunk_index INTEGER PRIMARY KEY CHECK(chunk_index>=0), "
                + "payload BLOB NOT NULL CHECK(length(payload) BETWEEN 1 AND 262144))");
    }

    @Override public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported local database version; data was preserved");
    }

    @Override public synchronized JSONObject read() throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        // A cursor may refill its window using another query. Keep the manifest
        // and every small chunk in one database snapshot, even across helpers.
        database.beginTransactionNonExclusive();
        try {
            final int length, expectedChunks;
            final String expectedHash;
            try (Cursor cursor = database.query("offline_manifest",
                    new String[]{"length_bytes", "sha256", "chunk_count"}, "id=1", null, null, null, null)) {
                if (!cursor.moveToFirst()) {
                    try (Cursor chunks = database.rawQuery("SELECT count(*) FROM offline_chunks", null)) {
                        if (!chunks.moveToFirst() || chunks.getLong(0) != 0) throw invalid("缺少分块清单");
                    }
                    database.setTransactionSuccessful();
                    return null;
                }
                long rawLength = cursor.getLong(0), rawCount = cursor.getLong(2);
                if (rawLength < 1 || rawLength > MAX_BYTES || rawCount < 1 || rawCount > MAX_CHUNKS
                        || rawCount != (rawLength + CHUNK_BYTES - 1) / CHUNK_BYTES)
                    throw invalid("分块清单长度无效");
                length = (int) rawLength;
                expectedChunks = (int) rawCount;
                expectedHash = cursor.getString(1);
                if (expectedHash == null || !expectedHash.matches("[a-f0-9]{64}") || cursor.moveToNext())
                    throw invalid("分块清单摘要无效");
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            ByteArrayOutputStream output = new ByteArrayOutputStream(length);
            int index = 0;
            try (Cursor cursor = database.query("offline_chunks", new String[]{"chunk_index", "payload"},
                    null, null, null, null, "chunk_index ASC")) {
                while (cursor.moveToNext()) {
                    if (index >= expectedChunks || cursor.getLong(0) != index) throw invalid("分块缺失、重复或乱序");
                    byte[] chunk = cursor.getBlob(1);
                    int expectedLength = Math.min(CHUNK_BYTES, length - index * CHUNK_BYTES);
                    if (chunk == null || chunk.length != expectedLength) throw invalid("分块长度不一致");
                    digest.update(chunk);
                    output.write(chunk, 0, chunk.length);
                    index++;
                }
            }
            if (index != expectedChunks || output.size() != length
                    || !MessageDigest.isEqual(expectedHash.getBytes(StandardCharsets.US_ASCII),
                    hex(digest.digest()).getBytes(StandardCharsets.US_ASCII)))
                throw invalid("分块数量或文件摘要不一致");
            String decoded = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString();
            JSONObject result = new JSONObject(decoded);
            database.setTransactionSuccessful();
            return result;
        } finally { database.endTransaction(); }
    }

    @Override public synchronized void write(JSONObject document) throws Exception {
        if (document == null) throw new IllegalArgumentException("本机数据不能为空");
        byte[] encoded = document.toString().getBytes(StandardCharsets.UTF_8);
        if (encoded.length < 1 || encoded.length > MAX_BYTES) throw invalid("本机数据超过存储安全容量");
        int chunkCount = (encoded.length + CHUNK_BYTES - 1) / CHUNK_BYTES;
        String hash = hex(MessageDigest.getInstance("SHA-256").digest(encoded));
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            database.delete("offline_chunks", null, null);
            for (int index = 0; index < chunkCount; index++) {
                int start = index * CHUNK_BYTES;
                ContentValues chunk = new ContentValues();
                chunk.put("chunk_index", index);
                chunk.put("payload", Arrays.copyOfRange(encoded, start, Math.min(encoded.length, start + CHUNK_BYTES)));
                if (database.insertOrThrow("offline_chunks", null, chunk) < 0) throw invalid("本机分块写入失败");
            }
            ContentValues header = new ContentValues();
            header.put("id", 1);
            header.put("length_bytes", encoded.length);
            header.put("sha256", hash);
            header.put("chunk_count", chunkCount);
            if (database.insertWithOnConflict("offline_manifest", null, header, SQLiteDatabase.CONFLICT_REPLACE) < 0)
                throw invalid("本机清单写入失败");
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }

    private static IOException invalid(String reason) {
        return new IOException(reason + "；原本机数据保留，未清空或重新初始化");
    }

    private static String hex(byte[] bytes) {
        char[] alphabet = "0123456789abcdef".toCharArray(), encoded = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            encoded[index * 2] = alphabet[(bytes[index] & 255) >>> 4];
            encoded[index * 2 + 1] = alphabet[bytes[index] & 15];
        }
        return new String(encoded);
    }
}
