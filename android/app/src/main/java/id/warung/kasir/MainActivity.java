package id.warung.kasir;

import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        // warna di belakang status bar mengikuti warna header aplikasi
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#0F766E"));
    }
}
