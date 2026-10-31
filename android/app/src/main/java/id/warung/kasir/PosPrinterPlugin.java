package id.warung.kasir;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;

/**
 * Cetak ESC/POS ke printer thermal Bluetooth klasik (SPP) yang sudah dipasangkan di HP,
 * plus bagikan teks / file (backup, CSV) lewat menu "Bagikan" Android.
 */
@CapacitorPlugin(
    name = "PosPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class PosPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket socket;
    private String socketAddress;

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m != null ? m.getAdapter() : null;
    }

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("bluetooth", call, "listPermCallback");
            return;
        }
        doList(call);
    }

    @PermissionCallback
    private void listPermCallback(PluginCall call) {
        if (needsPermission()) {
            call.reject("Izin Bluetooth ditolak. Izinkan \"Perangkat sekitar\" di pengaturan aplikasi.");
            return;
        }
        doList(call);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("HP ini tidak punya Bluetooth.");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth mati. Nyalakan Bluetooth dulu.");
            return;
        }
        JSArray list = new JSArray();
        Set<BluetoothDevice> bonded = a.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName() != null ? d.getName() : d.getAddress());
                o.put("address", d.getAddress());
                list.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("devices", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("bluetooth", call, "printPermCallback");
            return;
        }
        doPrint(call);
    }

    @PermissionCallback
    private void printPermCallback(PluginCall call) {
        if (needsPermission()) {
            call.reject("Izin Bluetooth ditolak. Izinkan \"Perangkat sekitar\" di pengaturan aplikasi.");
            return;
        }
        doPrint(call);
    }

    private void doPrint(PluginCall call) {
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || data == null) {
            call.reject("Printer belum dipilih.");
            return;
        }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        new Thread(() -> {
            try {
                write(address, bytes);
                call.resolve();
            } catch (Exception first) {
                // koneksi lama mungkin sudah putus, coba sambung ulang sekali
                closeSocket();
                try {
                    write(address, bytes);
                    call.resolve();
                } catch (Exception e) {
                    closeSocket();
                    call.reject("Gagal terhubung ke printer. Pastikan printer menyala dan dekat HP. (" + e.getMessage() + ")");
                }
            }
        }).start();
    }

    @SuppressLint("MissingPermission")
    private synchronized void write(String address, byte[] bytes) throws Exception {
        if (socket == null || !socket.isConnected() || !address.equals(socketAddress)) {
            closeSocket();
            BluetoothAdapter a = adapter();
            if (a == null || !a.isEnabled()) throw new IOException("Bluetooth mati");
            a.cancelDiscovery();
            BluetoothDevice device = a.getRemoteDevice(address);
            BluetoothSocket s;
            try {
                s = device.createRfcommSocketToServiceRecord(SPP);
                s.connect();
            } catch (IOException e) {
                // cadangan untuk printer murah yang tidak mengiklankan layanan SPP
                Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                s = (BluetoothSocket) m.invoke(device, 1);
                s.connect();
            }
            socket = s;
            socketAddress = address;
        }
        OutputStream out = socket.getOutputStream();
        int chunk = 512;
        for (int i = 0; i < bytes.length; i += chunk) {
            out.write(bytes, i, Math.min(chunk, bytes.length - i));
            out.flush();
            Thread.sleep(10);
        }
    }

    private synchronized void closeSocket() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {}
        socket = null;
        socketAddress = null;
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSocket();
        call.resolve();
    }

    /** Buka URL intent (misalnya untuk aplikasi RawBT). */
    @PluginMethod
    public void openIntent(PluginCall call) {
        try {
            Intent intent = Intent.parseUri(call.getString("url"), Intent.URI_INTENT_SCHEME);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Aplikasi RawBT belum terpasang. Pasang dari Play Store.");
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        if (call.getString("title") != null) send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title"));
        getActivity().startActivity(Intent.createChooser(send, call.getString("title", "Bagikan")));
        call.resolve();
    }

    /** Simpan file ke cache lalu buka menu Bagikan (simpan ke Drive, WhatsApp, File, dll). */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("filename", "file.txt");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream fo = new FileOutputStream(f)) {
                fo.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, "Simpan / kirim " + name));
            call.resolve();
        } catch (Exception e) {
            call.reject("Gagal menyimpan file: " + e.getMessage());
        }
    }
}
